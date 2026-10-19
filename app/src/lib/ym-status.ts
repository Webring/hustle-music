import { useSyncExternalStore } from "react"

// Проблемы с Яндекс Музыкой, о которых стоит сказать человеку.
// Виджет сам о них не сообщает (кроме ERROR на конкретный трек), поэтому распознаём по поведению:
//   insecure    — страница не «безопасная» (http по IP): виджет на «Играть» сразу отвечает STOPPED
//   unreachable — виджет не прислал READY: нет сети, music.yandex.ru заблокирован, мешает VPN/блокировщик
//   stuck       — попросили играть, а PLAYING так и не пришёл
//   preview     — трек «закончился» на ~30 секунде, хотя он длиннее: нет входа или подписки Плюс
//   unavailable — конкретный трек недоступен (ERROR), плеер переключил на следующий
export type YmIssue = "insecure" | "unreachable" | "stuck" | "preview" | "unavailable"

// Чем выше в списке, тем важнее: показываем самую важную из активных
const PRIORITY: YmIssue[] = ["insecure", "unreachable", "stuck", "preview", "unavailable"]

const active = new Set<YmIssue>()
const dismissed = new Set<YmIssue>() // закрыли крестиком — до перезагрузки не показываем
const timers = new Map<YmIssue, ReturnType<typeof setTimeout>>()
const listeners = new Set<() => void>()
let current: YmIssue | null = null

function update() {
  current = PRIORITY.find((i) => active.has(i)) ?? null
  listeners.forEach((fn) => fn())
}

// ttlMs — для временных сообщений (трек недоступен): сами исчезнут
export function raiseYmIssue(issue: YmIssue, ttlMs?: number) {
  if (dismissed.has(issue)) return
  clearTimeout(timers.get(issue))
  if (ttlMs) timers.set(issue, setTimeout(() => clearYmIssue(issue), ttlMs))
  if (active.has(issue)) return
  active.add(issue)
  update()
}

export function clearYmIssue(issue: YmIssue) {
  clearTimeout(timers.get(issue))
  timers.delete(issue)
  if (!active.delete(issue)) return
  update()
}

export function dismissYmIssue(issue: YmIssue) {
  dismissed.add(issue)
  clearYmIssue(issue)
}

export const useYmIssue = () =>
  useSyncExternalStore(
    (fn) => (listeners.add(fn), () => void listeners.delete(fn)),
    () => current,
  )

// localhost браузеры считают безопасным и без https
if ((location.protocol === "http:" || location.protocol === "https:") && !window.isSecureContext) raiseYmIssue("insecure")
