import { useSyncExternalStore } from "react"
import { getSettings, type Interval } from "./settings"
import { getTracks, type Track } from "./tracks"
import { playSignal, stopSignal } from "./signal"
import { isDisliked } from "./marks"
import { claimAudio, registerAudio } from "./focus"
import { ymWidget } from "./ym-widget"
import { clearYmIssue, raiseYmIssue } from "./ym-status"

const START_TIMEOUT_MS = 12_000 // попросили играть, а PLAYING нет — сообщаем, что не запускается
const PREVIEW_SEC = 30 // столько играют треки без подписки

// Плеер живёт вне React: держит очередь, таймер «90 секунд» и командует виджетом
// Яндекс Музыки. Виджету каждый раз отдаём очередь из одного трека — так он не
// переключает треки сам, и смену (с Bring the action) полностью ведём мы.
//
// Ограничения протокола виджета: нет перемотки, громкости и текущей позиции.
// Время на экране — наш собственный отсчёт с момента старта трека.

type Status = "idle" | "loading" | "playing" | "paused" | "changing"

export type PlayerState = {
  queue: string[]
  qi: number
  status: Status
  elapsed: number // сколько играет текущий трек, секунд (по статусам виджета)
  previewId: string | null // трек, запущенный из базы, вне очереди
  time: number
  duration: number
  paused: boolean
}

class Player {
  private gen = 0
  private pending: number | null = null // куда идёт автоматический переход
  private wantId: string | null = null // какой трек мы попросили у виджета
  private failures = 0 // подряд недоступных треков — чтобы не крутиться бесконечно
  private startTimer: ReturnType<typeof setTimeout> | undefined
  private s: Omit<PlayerState, "time" | "duration" | "paused"> = {
    queue: [], qi: 0, status: "idle", elapsed: 0, previewId: null,
  }
  private snap: PlayerState = { ...this.s, time: 0, duration: 0, paused: true }
  private listeners = new Set<() => void>()

  constructor() {
    registerAudio("player", () => this.yieldAudio())
    ymWidget.on((e) => {
      if (e.type === "state") this.onWidgetState(e.trackId, e.status)
      if (e.type === "error") this.onWidgetError()
    })

    let last = performance.now()
    setInterval(() => {
      const now = performance.now()
      const dt = (now - last) / 1000
      last = now
      if (this.s.status === "playing") {
        this.s.elapsed += dt
        const cfg = getSettings()
        if (cfg.timed && this.s.previewId == null && this.s.elapsed >= cfg.timedSec) this.advance()
      }
      this.emit()
    }, 250)
  }

  // ---------- подписка ----------
  subscribe = (fn: () => void) => (this.listeners.add(fn), () => void this.listeners.delete(fn))
  getSnapshot = () => this.snap
  private emit(patch?: Partial<typeof this.s>) {
    if (patch) Object.assign(this.s, patch)
    const t = this.current()
    this.snap = {
      ...this.s,
      time: this.s.status === "idle" ? 0 : this.s.elapsed,
      duration: t?.durationMs ? t.durationMs / 1000 : 0,
      paused: this.s.status !== "playing" && this.s.status !== "loading",
    }
    this.listeners.forEach((fn) => fn())
  }

  current(): Track | undefined {
    const id = this.s.previewId ?? this.s.queue[this.s.qi]
    return id == null ? undefined : getTracks().byId.get(id)
  }

  // ---------- события виджета ----------
  private onWidgetState(trackId: string | null, status: string) {
    if (trackId !== this.wantId || this.s.status === "idle" || this.s.status === "changing") return
    if (status === "PLAYING") {
      this.failures = 0
      this.waitStart(false)
      if (this.s.status !== "playing") this.emit({ status: "playing" })
    } else if (status === "PAUSED" && this.s.status === "playing") {
      this.emit({ status: "paused" }) // поставили на паузу в самом виджете
    } else if (status === "ENDED" && this.s.status === "playing") {
      this.checkPreview()
      if (this.s.previewId != null) return this.emit({ previewId: null, status: "idle" })
      this.advance()
    }
  }

  // Без подписки виджет обрывает трек на 30-й секунде и присылает обычный ENDED.
  // Если «закончился» трек, который по базе заметно длиннее, — значит, играют фрагменты.
  private checkPreview() {
    const len = (this.current()?.durationMs ?? 0) / 1000
    const e = this.s.elapsed
    if (len > PREVIEW_SEC + 15 && e > PREVIEW_SEC - 8 && e < PREVIEW_SEC + 8) raiseYmIssue("preview")
    else if (e > PREVIEW_SEC + 15) clearYmIssue("preview") // трек доиграл дальше 30 секунд — подписка есть
  }

  private pauseWidget() {
    this.waitStart(false)
    ymWidget.pause()
  }

  // Ждём PLAYING после команды «играть»; не дождались — говорим, что трек не запускается
  private waitStart(on: boolean) {
    clearTimeout(this.startTimer)
    if (on) this.startTimer = setTimeout(() => raiseYmIssue("stuck"), START_TIMEOUT_MS)
    else clearYmIssue("stuck")
  }

  // Трек недоступен или не играет — берём следующий и коротко говорим об этом
  private onWidgetError() {
    if (this.s.status !== "loading" && this.s.status !== "playing") return
    raiseYmIssue("unavailable", 6_000)
    if (this.s.previewId != null) return this.emit({ previewId: null, status: "idle" })
    const n = this.s.queue.length
    if (++this.failures >= Math.min(n, 10)) return this.stop()
    this.switchTo((this.s.qi + 1) % n)
  }

  // ---------- запуск трека ----------
  private startTrack(t: Track | undefined) {
    if (!t) return this.stop()
    this.wantId = t.id
    claimAudio("player")
    ymWidget.playTracks([{ trackId: t.id, albumId: t.albumId, title: t.title, subtitle: t.artist }])
    this.waitStart(true)
    this.emit({ status: "loading", elapsed: 0 })
  }

  private startCurrent() {
    this.startTrack(this.current())
  }

  // Автоматический переход к треку i: пауза, сигнал, старт
  private async changeTo(i: number) {
    const g = ++this.gen
    this.pending = i
    this.emit({ status: "changing" })
    this.pauseWidget()
    if (getSettings().bta) await playSignal()
    if (g !== this.gen) return
    this.pending = null
    this.emit({ qi: i })
    this.startCurrent()
  }

  // Ручная смена (некст, назад, клик в списке): сразу и без сигнала.
  // Если в этот момент шёл автоматический переход — он отменяется.
  private switchTo(i: number) {
    this.gen++
    this.pending = null
    stopSignal()
    this.emit({ qi: i })
    this.startCurrent()
  }

  // Автоматическая смена: трек закончился или истекли 90 секунд
  private advance() {
    if (this.s.status !== "playing") return
    const n = this.s.queue.length
    this.changeTo(getSettings().repeat ? this.s.qi : (this.s.qi + 1) % n)
  }

  // Другой плеер (репитер) начал играть — встаём на паузу
  private yieldAudio() {
    if (this.s.status === "changing") return this.stop()
    if (this.s.status === "playing" || this.s.status === "loading") {
      this.pauseWidget()
      this.emit({ status: "paused" })
    }
  }

  // ---------- публичные действия ----------
  setQueue(ids: string[]) {
    const wasPlaying = this.s.status !== "idle" && this.s.previewId == null
    const curId = this.s.queue[this.s.qi]
    const keep = wasPlaying ? ids.indexOf(curId) : -1
    if (keep >= 0) return this.emit({ queue: ids, qi: keep }) // текущий трек остался в подборке — не прерываем
    this.stop()
    this.emit({ queue: ids, qi: 0 })
  }

  togglePlay() {
    if (this.s.status === "idle") {
      if (!this.s.queue.length) return
      this.failures = 0
      return this.startCurrent()
    }
    if (this.s.status === "changing" && this.pending != null) return this.switchTo(this.pending)
    if (this.s.status === "paused") {
      claimAudio("player")
      ymWidget.resume()
      this.waitStart(true)
      this.emit({ status: "loading" }) // время пойдёт, когда виджет подтвердит PLAYING
    } else {
      this.pauseWidget()
      this.emit({ status: "paused" })
    }
  }

  playAt(i: number) {
    this.failures = 0
    if (this.s.previewId != null) this.emit({ previewId: null })
    if (this.s.status === "idle") {
      this.emit({ qi: i })
      return this.startCurrent()
    }
    this.switchTo(i)
  }

  next() {
    const n = this.s.queue.length
    if (!n) return
    if (this.s.status === "idle") return this.emit({ qi: (this.s.qi + 1) % n })
    // во время сигнала «некст» просто доводит переход до конца
    this.switchTo(this.pending ?? (this.s.qi + 1) % n)
  }

  prev() {
    const n = this.s.queue.length
    if (!n) return
    // как в обычных плеерах: после 3 секунд — в начало трека
    if ((this.s.status === "playing" || this.s.status === "paused") && this.s.elapsed > 3) return this.switchTo(this.s.qi)
    if (this.s.status === "idle") return this.emit({ qi: (this.s.qi - 1 + n) % n })
    this.switchTo((this.s.qi - 1 + n) % n)
  }

  // Дизлайк: трек убирается из подборки. Если он играл — сразу следующий.
  removeFromQueue(id: string) {
    const idx = this.s.queue.indexOf(id)
    if (idx < 0) return
    const queue = this.s.queue.filter((x) => x !== id)
    const isCur = idx === this.s.qi && this.s.status !== "idle" && this.s.previewId == null
    let qi = idx < this.s.qi ? this.s.qi - 1 : this.s.qi
    if (this.pending != null && idx < this.pending) this.pending--
    if (!queue.length) {
      this.stop()
      return this.emit({ queue, qi: 0 })
    }
    if (qi >= queue.length) qi = 0
    if (this.pending != null && this.pending >= queue.length) this.pending = 0
    this.s.queue = queue
    if (isCur) return this.switchTo(qi) // на место удалённого встал следующий трек
    this.emit({ qi })
  }

  stop() {
    this.gen++
    this.pending = null
    this.wantId = null
    if (this.s.status !== "idle") this.pauseWidget()
    stopSignal()
    this.emit({ status: "idle", elapsed: 0, previewId: null })
  }

  // Прослушивание из базы треков — вне очереди
  preview(id: string) {
    if (this.s.previewId === id) return this.togglePlay()
    this.stop()
    const t = getTracks().byId.get(id)
    if (!t) return
    this.emit({ previewId: id })
    this.startTrack(t)
  }
}

export const player = new Player()
export const usePlayer = () => useSyncExternalStore(player.subscribe, player.getSnapshot)

export function buildQueue(tracks: Track[], intervals: Interval[], shuffle: boolean) {
  const list = tracks.filter((t) => !isDisliked(t.id) && intervals.some((i) => t.bpm >= i.from && t.bpm <= i.to))
  if (shuffle) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[list[i], list[j]] = [list[j], list[i]]
    }
  } else {
    list.sort((a, b) => a.bpm - b.bpm || `${a.artist} ${a.title}`.localeCompare(`${b.artist} ${b.title}`, "ru"))
  }
  return list.map((t) => t.id)
}
