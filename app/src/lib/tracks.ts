import db from "@/data/tracks.json"

// База треков: ID из Яндекс Музыки и темп (BPM) каждого трека.
// Собирается скриптом scripts/build-ym-db.mjs, в приложение встроена целиком.

export type Track = {
  id: string // ID трека в Яндекс Музыке
  albumId: string
  artist: string
  title: string
  bpm: number
  durationMs: number | null
  cover: string | null // шаблон адреса обложки ЯМ, «%%» — размер
}

type State = { status: "ready"; tracks: Track[]; byId: Map<string, Track> }

const tracks = db as Track[]
const state: State = { status: "ready", tracks, byId: new Map(tracks.map((t) => [t.id, t])) }

export const getTracks = () => state
export const useTracks = () => state

export const trackLabel = (t?: Track) => (t ? (t.artist ? `${t.artist} — ${t.title}` : t.title) : "")

export const coverUrl = (t: Track | undefined, size = 100) =>
  t?.cover ? `https://${t.cover.replace("%%", `${size}x${size}`)}` : null
