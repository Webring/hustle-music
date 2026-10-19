import { useSyncExternalStore } from "react"
import { playSignal, stopSignal } from "./signal"
import { claimAudio, registerAudio } from "./focus"
import { getSettings } from "./settings"
import { idbDel, idbGet, idbSet } from "./idb"

// Репитер: отдельный плеер, который крутит фрагмент трека от A до B.
// Перед каждым повтором может звучать Bring the action.
// Работает только со своими файлами: у виджета Яндекс Музыки нет перемотки.

export type RepeaterSource = { kind: "file"; name: string }
type Status = "idle" | "playing" | "paused" | "signal"

export type RepeaterState = {
  source: RepeaterSource | null
  a: number
  b: number
  duration: number
  time: number
  status: Status
  loops: number // сколько раз фрагмент уже повторился
  bta: boolean
  loading: boolean
  error: boolean
}

type Saved = { source: RepeaterSource | null; a: number; b: number; bta: boolean }

const KEY = "hustle-player:repeater"
const FILE_KEY = "repeater-file"
export const MIN_LEN = 0.5 // самый короткий фрагмент, секунд

class Repeater {
  private audio = new Audio()
  private gen = 0
  private url: string | null = null
  private restoreAB: { a: number; b: number } | null = null
  private listeners = new Set<() => void>()
  private s: Omit<RepeaterState, "time"> = {
    source: null, a: 0, b: 0, duration: 0, status: "idle", loops: 0, bta: true, loading: false, error: false,
  }
  private snap: RepeaterState = { ...this.s, time: 0 }

  constructor() {
    this.audio.preload = "auto"
    this.audio.addEventListener("loadedmetadata", () => this.onMeta())
    this.audio.addEventListener("error", () => this.url && this.emit({ loading: false, error: true }))
    this.audio.addEventListener("ended", () => this.s.status === "playing" && this.loop())
    for (const ev of ["play", "pause", "seeked"]) this.audio.addEventListener(ev, () => this.emit())
    registerAudio("repeater", () => this.pause())

    // Проверяем границу часто: timeupdate срабатывает лишь ~4 раза в секунду
    setInterval(() => {
      if (this.s.status !== "playing" || this.audio.paused) return
      if (this.audio.currentTime >= this.s.b - 0.03) this.loop()
      else this.emit()
    }, 30)

    this.restore()
  }

  // ---------- подписка ----------
  subscribe = (fn: () => void) => (this.listeners.add(fn), () => void this.listeners.delete(fn))
  getSnapshot = () => this.snap
  private emit(patch?: Partial<typeof this.s>) {
    if (patch) Object.assign(this.s, patch)
    this.snap = { ...this.s, time: this.audio.currentTime || 0 }
    this.listeners.forEach((fn) => fn())
  }

  // ---------- сохранение ----------
  private save() {
    const data: Saved = { source: this.s.source, a: this.s.a, b: this.s.b, bta: this.s.bta }
    try {
      localStorage.setItem(KEY, JSON.stringify(data))
    } catch {
      /* не страшно */
    }
  }

  private async restore() {
    let saved: Saved | null = null
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || "null")
    } catch {
      /* нет сохранённого */
    }
    if (!saved) return
    this.s.bta = saved.bta ?? true
    if (!saved.source) return this.emit()
    if (saved.source.kind !== "file") return this.emit() // записи старых версий (не свой файл) пропускаем
    this.restoreAB = { a: saved.a, b: saved.b }
    try {
      const file = await idbGet<File>(FILE_KEY)
      if (file) return this.open(saved.source, URL.createObjectURL(file))
    } catch {
      /* IndexedDB недоступна */
    }
    this.emit({ source: null })
  }

  private open(source: RepeaterSource, url: string) {
    this.gen++
    this.audio.pause()
    if (this.url?.startsWith("blob:") && this.url !== url) URL.revokeObjectURL(this.url)
    this.url = url
    this.audio.src = url
    this.emit({ source, status: "idle", loops: 0, loading: true, error: false, duration: 0 })
  }

  private onMeta() {
    const d = this.audio.duration || 0
    const r = this.restoreAB
    this.restoreAB = null
    const valid = r && r.a >= 0 && r.b <= d + 0.01 && r.b - r.a >= MIN_LEN
    const a = valid ? r.a : 0
    const b = valid ? Math.min(r.b, d) : d
    this.audio.currentTime = a
    this.emit({ duration: d, a, b, loading: false })
    this.save()
  }

  // ---------- источник ----------
  async setFile(file: File) {
    this.open({ kind: "file", name: file.name }, URL.createObjectURL(file))
    this.save()
    try {
      await idbSet(FILE_KEY, file)
    } catch {
      /* сохранится только до перезагрузки */
    }
  }

  clear() {
    this.gen++
    this.audio.pause()
    if (this.url?.startsWith("blob:")) URL.revokeObjectURL(this.url)
    this.url = null
    this.audio.removeAttribute("src")
    this.audio.load()
    this.emit({ source: null, status: "idle", loops: 0, loading: false, error: false, duration: 0, a: 0, b: 0 })
    idbDel(FILE_KEY).catch(() => {})
    this.save()
  }

  // ---------- границы ----------
  setRange(a: number, b: number) {
    const d = this.s.duration
    if (!d) return
    a = Math.max(0, Math.min(a, d - MIN_LEN))
    b = Math.min(d, Math.max(b, a + MIN_LEN))
    const t = this.audio.currentTime
    if (t < a || t > b) this.audio.currentTime = a
    this.emit({ a: round(a), b: round(b) })
    this.save()
  }
  nudge(edge: "a" | "b", delta: number) {
    if (edge === "a") this.setRange(this.s.a + delta, this.s.b)
    else this.setRange(this.s.a, this.s.b + delta)
  }
  markHere(edge: "a" | "b") {
    const t = this.audio.currentTime
    if (edge === "a") this.setRange(t, Math.max(this.s.b, t + MIN_LEN))
    else this.setRange(Math.min(this.s.a, t - MIN_LEN), t)
  }

  setBta(v: boolean) {
    this.emit({ bta: v })
    this.save()
  }

  // ---------- воспроизведение ----------
  applyVol() {
    this.audio.volume = Math.max(0, Math.min(1, getSettings().vol / 100))
  }

  play() {
    if (!this.s.source || this.s.loading || this.s.error) return
    this.gen++
    claimAudio("repeater")
    const t = this.audio.currentTime
    if (t < this.s.a || t >= this.s.b - 0.05) this.audio.currentTime = this.s.a
    this.applyVol()
    this.audio.play().catch(() => {})
    this.emit({ status: "playing" })
  }

  pause() {
    if (this.s.status === "idle") return
    this.gen++
    if (this.s.status === "signal") stopSignal()
    this.audio.pause()
    this.emit({ status: "paused" })
  }

  toggle() {
    if (this.s.status === "playing" || this.s.status === "signal") this.pause()
    else this.play()
  }

  // В начало фрагмента
  restart() {
    this.audio.currentTime = this.s.a
    this.emit({ loops: 0 })
    if (this.s.status !== "playing") this.play()
  }

  seek(t: number) {
    this.audio.currentTime = Math.max(0, Math.min(t, this.s.duration))
    this.emit()
  }

  // Дошли до B: Bring the action (если включён) и снова с A
  private async loop() {
    const g = ++this.gen
    this.s.loops++
    if (this.s.bta) {
      this.audio.pause()
      this.emit({ status: "signal" })
      await playSignal()
      if (g !== this.gen) return
    }
    this.audio.currentTime = this.s.a
    if (this.audio.paused) this.audio.play().catch(() => {})
    this.emit({ status: "playing" })
  }
}

const round = (x: number) => Math.round(x * 10) / 10

export const repeater = new Repeater()
export const useRepeater = () => useSyncExternalStore(repeater.subscribe, repeater.getSnapshot)
