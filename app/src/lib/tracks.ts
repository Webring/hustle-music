import { useSyncExternalStore } from "react"
import db from "@/data/tracks.json"
import { normalizeTags, parseLibrary, serializeLibrary, validateCustomTrack, type Library, type Track } from "./track-data"
import { setAudioCredentials } from "./audio-source"

export type { AudioAuth, Track, TrackSource } from "./track-data"

// База треков: ID из Яндекс Музыки и темп (BPM) каждого трека.
// Собирается скриптом scripts/build-ym-db.mjs, в приложение встроена целиком.

const KEY = "hustle-player:library:v1"
const listeners = new Set<() => void>()
let warning: string | null = null
let library: Library = (() => {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) return parseLibrary(saved)
  } catch {
    warning = "Не удалось восстановить библиотеку из браузера. Можно импортировать сохранённый JSON."
  }
  return { version: 1, tracks: [], tags: {} }
})()

function snapshot() {
  const byId = new Map((db as Track[]).map((t) => [t.id, t]))
  for (const t of library.tracks) byId.set(t.id, t)
  for (const [id, tags] of Object.entries(library.tags)) {
    const t = byId.get(id)
    if (t) byId.set(id, { ...t, tags })
  }
  return { status: "ready" as const, tracks: [...byId.values()], byId, warning }
}
let state = snapshot()

function save(next: Library) {
  try {
    localStorage.setItem(KEY, serializeLibrary(next))
    warning = null
  } catch {
    warning = "Браузер не сохранил изменения. Они доступны до обновления страницы — скачайте JSON."
  }
  library = next
  state = snapshot()
  listeners.forEach((fn) => fn())
}

export function saveCustomTrack(value: Track, previousId?: string) {
  const track = validateCustomTrack(value)
  const duplicate = library.tracks.find((t) => t.id !== previousId && (t.id === track.id || (t.source === "audio" && t.url === track.url)))
  if (duplicate) throw new Error("Этот трек уже добавлен. Найдите его в списке и выберите «Изменить трек».")
  const tags = { ...library.tags }
  delete tags[track.id]
  save({ ...library, tracks: [...library.tracks.filter((t) => t.id !== previousId), track], tags })
  return track
}

export function removeCustomTrack(id: string) {
  save({ ...library, tracks: library.tracks.filter((t) => t.id !== id) })
}

export function setTrackTags(id: string, value: string) {
  const tags = normalizeTags(value)
  if (library.tracks.some((t) => t.id === id)) {
    save({ ...library, tracks: library.tracks.map((t) => t.id === id ? { ...t, tags } : t) })
  } else {
    save({ ...library, tags: { ...library.tags, [id]: tags } })
  }
}

export function importLibrary(text: string) {
  const incoming = parseLibrary(text)
  const tracks = new Map(library.tracks.map((t) => [t.id, t]))
  for (const track of incoming.tracks) {
    const previous = tracks.get(track.id)
    if (!previous || previous.url !== track.url || JSON.stringify(previous.auth) !== JSON.stringify(track.auth)) setAudioCredentials(track.id, null)
    tracks.set(track.id, track)
  }
  const tags = { ...library.tags, ...incoming.tags }
  for (const track of incoming.tracks) delete tags[track.id]
  save({ version: 1, tracks: [...tracks.values()], tags })
  return incoming.tracks.length
}

export const exportLibrary = () => serializeLibrary(library)

export const getTracks = () => state
export const useTracks = () => useSyncExternalStore(
  (fn) => (listeners.add(fn), () => void listeners.delete(fn)),
  () => state,
)

export const trackLabel = (t?: Track) => (t ? (t.artist ? `${t.artist} — ${t.title}` : t.title) : "")

export const coverUrl = (t: Track | undefined, size = 100) =>
  t?.cover ? `https://${t.cover.replace("%%", `${size}x${size}`)}` : null
