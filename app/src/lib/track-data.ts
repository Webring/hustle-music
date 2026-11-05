export type AudioAuth =
  | { type: "none" }
  | { type: "bearer" }
  | { type: "basic" }
  | { type: "api-key"; header: string }

export type Track = {
  id: string
  albumId: string
  artist: string
  title: string
  bpm: number
  durationMs: number | null
  cover: string | null
  source?: "yandex" | "audio"
  url?: string
  auth?: AudioAuth
  tags?: string[]
  custom?: boolean
}

export type Library = { version: 1; tracks: Track[]; tags: Record<string, string[]> }
export type TrackSource = "all" | "yandex" | "audio" | "custom"

export function normalizeTags(value: string | string[]): string[] {
  const tags = typeof value === "string" ? value.split(/[,;\n]/) : value
  const seen = new Set<string>()
  return tags.map((t) => t.trim().replace(/\s+/g, " ")).filter((t) => {
    const key = t.toLocaleLowerCase("ru")
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function parseTrackUrl(value: string): URL {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error("Укажите полную ссылку, начиная с https://.") }
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Нужна ссылка по http или https.")
  if (url.username || url.password) throw new Error("Укажите логин и пароль в разделе авторизации, отдельно от ссылки.")
  return url
}

export function parseYandexUrl(value: string): { id: string; albumId: string; url: string } {
  const url = parseTrackUrl(value)
  if (!/^(?:next\.)?music\.yandex\.(?:ru|com|by|kz|uz|com\.tr)$/.test(url.hostname)) {
    throw new Error("Нужна ссылка на трек в Яндекс Музыке.")
  }
  const album = url.pathname.match(/^\/album\/(\d+)\/track\/(\d+)\/?$/)
  const embed = url.pathname.match(/^\/iframe\/track\/(\d+)\/(\d+)\/?$/) ?? url.hash.match(/^#track\/(\d+)\/(\d+)\/?$/)
  const id = album?.[2] ?? embed?.[1]
  const albumId = album?.[1] ?? embed?.[2]
  if (!id || !albumId) throw new Error("Скопируйте ссылку на трек с альбомом: music.yandex.ru/album/…/track/….")
  return { id, albumId, url: `https://music.yandex.ru/album/${albumId}/track/${id}` }
}

export function validateBpm(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 400) {
    throw new Error("Укажите BPM от 1 до 400.")
  }
  return value
}

export function validateAuth(value: unknown): AudioAuth {
  const auth = value as Partial<AudioAuth> | null
  if (!auth || auth.type === "none") return { type: "none" }
  if (auth.type === "bearer" || auth.type === "basic") return { type: auth.type }
  if (auth.type === "api-key" && "header" in auth && typeof auth.header === "string") {
    const header = auth.header.trim()
    if (!/[\r\n]/.test(auth.header) && /^[a-zA-Z0-9!#$%&'*+.^_`|~-]+$/.test(header) && !/^(?:authorization|cookie|host|origin|referer|content-length|sec-.*|proxy-.*)$/i.test(header)) {
      return { type: "api-key", header }
    }
  }
  throw new Error("Проверьте тип авторизации и название заголовка API key.")
}

// Собираем только известные поля: пароли и токены из чужого JSON не попадают в библиотеку.
export function validateCustomTrack(value: unknown): Track {
  if (!value || typeof value !== "object") throw new Error("В JSON найдена некорректная запись трека.")
  const t = value as Record<string, unknown>
  const bpm = validateBpm(t.bpm)
  if (t.tags !== undefined && (!Array.isArray(t.tags) || !t.tags.every((tag) => typeof tag === "string"))) {
    throw new Error("Теги трека должны быть массивом строк.")
  }
  const source = t.source === "audio" ? "audio" : "yandex"
  if (t.source !== undefined && t.source !== "audio" && t.source !== "yandex") throw new Error("Неизвестный источник трека.")
  const link = source === "yandex"
    ? parseYandexUrl(typeof t.url === "string" ? t.url : `https://music.yandex.ru/album/${t.albumId}/track/${t.id}`)
    : { url: parseTrackUrl(String(t.url ?? "")).href, albumId: "", id: String(t.id ?? "") }
  if (source === "audio" && !/^audio:[a-zA-Z0-9-]+$/.test(link.id)) throw new Error("Некорректный ID аудиотрека.")
  const title = typeof t.title === "string" ? t.title.trim() : ""
  if (!title) throw new Error("Укажите название трека.")
  return {
    ...link, source, custom: true, title,
    artist: typeof t.artist === "string" ? t.artist.trim() : "",
    bpm, tags: normalizeTags((t.tags ?? []) as string[]),
    durationMs: typeof t.durationMs === "number" && Number.isFinite(t.durationMs) && t.durationMs > 0 ? t.durationMs : null,
    cover: typeof t.cover === "string" && /^[\w./%-]+$/.test(t.cover) ? t.cover : null,
    ...(source === "audio" ? { auth: validateAuth(t.auth) } : {}),
  }
}

export function parseLibrary(text: string): Library {
  let data: unknown
  try { data = JSON.parse(text) } catch { throw new Error("Не удалось прочитать JSON. Проверьте файл.") }
  if (!data || typeof data !== "object") throw new Error("Нужен JSON библиотеки треков.")
  const d = data as Record<string, unknown>
  if (d.version !== 1 || !Array.isArray(d.tracks) || !d.tags || typeof d.tags !== "object" || Array.isArray(d.tags)) {
    throw new Error("Неподдерживаемый формат библиотеки. Нужен файл, скачанный из этого плеера.")
  }
  const tracks = d.tracks.map(validateCustomTrack)
  if (new Set(tracks.map((t) => t.id)).size !== tracks.length) throw new Error("В JSON повторяются ID треков.")
  const tags: Record<string, string[]> = Object.create(null)
  for (const [id, list] of Object.entries(d.tags)) {
    if (!/^\d+$/.test(id) || !Array.isArray(list) || !list.every((tag) => typeof tag === "string")) throw new Error("Некорректный список тегов в JSON.")
    tags[id] = normalizeTags(list)
  }
  return { version: 1, tracks, tags }
}

export const serializeLibrary = (library: Library) => JSON.stringify({
  version: 1,
  tracks: library.tracks.map(validateCustomTrack),
  tags: library.tags,
})

export function fadeGain(time: number, duration: number, fadeSec: number): number {
  if (!Number.isFinite(duration) || duration <= 0 || fadeSec <= 0) return 1
  return Math.max(0, Math.min(1, (duration - time) / Math.min(fadeSec, duration)))
}
