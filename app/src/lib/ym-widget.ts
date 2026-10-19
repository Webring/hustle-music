import { useSyncExternalStore } from "react"
import { clearYmIssue, raiseYmIssue } from "./ym-status"

// Связь с виджетом Яндекс Музыки (iframe) через postMessage.
//
// Режим управления включается параметрами виджета display=bandlink-wiki и parentOrigin.
// Он не документирован: это партнёрская интеграция Яндекса, и он может измениться.
// Команды: PLAY_QUEUE, PLAY_SOURCE, PAUSE, RESUME, NEXT_TRACK, PREVIOUS_TRACK.
// Ответы: READY, STATE {currentTrack, status}, ERROR {code}.
// Перемотки, громкости и текущей позиции в протоколе нет.

export const YM_ORIGIN = "https://music.yandex.ru"
const READY_TIMEOUT_MS = 15_000 // не прислал READY за это время — считаем, что Яндекс недоступен

export type WidgetStatus = "IDLE" | "LOADING" | "PLAYING" | "PAUSED" | "STOPPED" | "ENDED" | "ERROR"
export type WidgetTrack = { trackId: string; albumId: string; title?: string; subtitle?: string }

export type WidgetEvent =
  | { type: "ready" }
  | { type: "state"; trackId: string | null; status: WidgetStatus }
  | { type: "error"; code: string; message?: string }

type Snapshot = { ready: boolean; trackId: string | null; status: WidgetStatus }

class YmWidget {
  private frame: HTMLIFrameElement | null = null
  private pending: object[] = []
  private handlers = new Set<(e: WidgetEvent) => void>()
  private storeListeners = new Set<() => void>()
  private snap: Snapshot = { ready: false, trackId: null, status: "IDLE" }
  private readyTimer: ReturnType<typeof setTimeout> | undefined

  constructor() {
    window.addEventListener("message", (e) => {
      if (e.origin !== YM_ORIGIN || !this.frame || e.source !== this.frame.contentWindow) return
      const d = e.data
      if (!d || d.source !== "YANDEX_MUSIC") return
      if (d.type === "READY") {
        clearTimeout(this.readyTimer)
        clearYmIssue("unreachable")
        this.setSnap({ ready: true })
        const queued = this.pending
        this.pending = []
        queued.forEach((m) => this.post(m))
        this.fire({ type: "ready" })
      } else if (d.type === "STATE") {
        const trackId = d.payload?.currentTrack?.trackId ?? null
        const status = (d.payload?.status ?? "IDLE") as WidgetStatus
        this.setSnap({ trackId, status })
        this.fire({ type: "state", trackId, status })
      } else if (d.type === "ERROR") {
        this.fire({ type: "error", code: d.payload?.code ?? "UNKNOWN", message: d.payload?.message })
      }
    })
  }

  // Адрес виджета. Управление работает только со страницы, открытой по http(s):
  // из файла (file://) Яндекс команды не принимает.
  src(initial: WidgetTrack) {
    const params = new URLSearchParams({ display: "bandlink-wiki", parentOrigin: location.origin })
    return `${YM_ORIGIN}/iframe/track/${initial.trackId}/${initial.albumId}?${params}`
  }
  get supported() {
    return location.protocol === "http:" || location.protocol === "https:"
  }

  attach(frame: HTMLIFrameElement) {
    this.frame = frame
    this.setSnap({ ready: false })
    clearTimeout(this.readyTimer)
    this.readyTimer = setTimeout(() => raiseYmIssue("unreachable"), READY_TIMEOUT_MS)
  }
  detach(frame: HTMLIFrameElement) {
    if (this.frame !== frame) return
    clearTimeout(this.readyTimer)
    this.frame = null
    this.setSnap({ ready: false })
  }

  private post(m: object) {
    this.frame?.contentWindow?.postMessage(m, YM_ORIGIN)
  }
  send(type: string, payload?: object) {
    const m = { source: "EXTERNAL_PLAYER", type, ...(payload ? { payload } : {}) }
    if (this.snap.ready && this.frame) this.post(m)
    else this.pending.push(m) // отправим, как только виджет пришлёт READY
  }

  playTracks(tracks: WidgetTrack[], startIndex = 0) {
    this.send("PLAY_QUEUE", { tracks, startIndex })
  }
  pause() { this.send("PAUSE") }
  resume() { this.send("RESUME") }

  on(fn: (e: WidgetEvent) => void) {
    this.handlers.add(fn)
    return () => void this.handlers.delete(fn)
  }
  private fire(e: WidgetEvent) {
    this.handlers.forEach((fn) => fn(e))
  }

  private setSnap(p: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...p }
    this.storeListeners.forEach((fn) => fn())
  }
  subscribe = (fn: () => void) => (this.storeListeners.add(fn), () => void this.storeListeners.delete(fn))
  getSnapshot = () => this.snap
}

export const ymWidget = new YmWidget()
export const useYmWidget = () => useSyncExternalStore(ymWidget.subscribe, ymWidget.getSnapshot)

export const ymTrackUrl = (t: { id: string; albumId: string }) => `${YM_ORIGIN}/album/${t.albumId}/track/${t.id}`
