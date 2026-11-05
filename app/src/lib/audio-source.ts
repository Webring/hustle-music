import type { AudioAuth } from "./track-data"

export type AudioCredentials = { token?: string; username?: string; password?: string }
const KEY = "hustle-player:audio-credentials"
let credentials: Record<string, AudioCredentials> = (() => {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "{}") } catch { return {} }
})()

export const getAudioCredentials = (id: string): AudioCredentials => credentials[id] ?? {}
export function setAudioCredentials(id: string, value: AudioCredentials | null) {
  credentials = { ...credentials }
  if (value) credentials[id] = value
  else delete credentials[id]
  try { sessionStorage.setItem(KEY, JSON.stringify(credentials)) } catch { /* останутся в памяти вкладки */ }
}

export function audioHeaders(auth: AudioAuth | undefined, value: AudioCredentials): Headers {
  const headers = new Headers()
  if (!auth || auth.type === "none") return headers
  if (auth.type === "basic") {
    if (!value.username || !value.password) throw new Error("Укажите логин и пароль в настройках трека.")
    if (value.username.includes(":")) throw new Error("Логин Basic не должен содержать двоеточие.")
    const bytes = new TextEncoder().encode(`${value.username}:${value.password}`)
    headers.set("Authorization", `Basic ${btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))}`)
  } else {
    if (!value.token?.trim()) throw new Error("Укажите токен в настройках трека.")
    if (/[\r\n]/.test(value.token)) throw new Error("Токен должен быть одной строкой.")
    headers.set(auth.type === "bearer" ? "Authorization" : auth.header, auth.type === "bearer" ? `Bearer ${value.token.trim()}` : value.token.trim())
  }
  return headers
}

export async function fetchAudio(url: string, auth: AudioAuth | undefined, value: AudioCredentials, signal: AbortSignal): Promise<Blob> {
  const headers = audioHeaders(auth, value)
  let response: Response
  try {
    response = await fetch(url, { headers, signal, credentials: "omit" })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error("Не удалось загрузить аудио. Проверьте ссылку и разрешение сервера на доступ из браузера (CORS).")
  }
  if (response.status === 401 || response.status === 403) throw new Error("Сервер не разрешил доступ. Проверьте авторизацию в настройках трека.")
  if (!response.ok) throw new Error(`Не удалось загрузить аудио: сервер ответил ${response.status}.`)
  const type = response.headers.get("content-type") ?? ""
  if (/text\/|application\/(?:json|xml|xhtml)/i.test(type)) throw new Error("По ссылке открывается страница, а не аудиофайл. Укажите прямую ссылку на файл.")
  const blob = await response.blob()
  if (!blob.size) throw new Error("Сервер вернул пустой аудиофайл.")
  return blob
}
