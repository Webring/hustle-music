import { useSyncExternalStore } from "react"

// Инструкция «как слушать треки целиком». При первом заходе открывается сама,
// потом — по ссылке из сообщения про 30-секундные отрывки.
const KEY = "hustle-player:ym-help-seen"
const listeners = new Set<() => void>()

function seen() {
  try {
    return localStorage.getItem(KEY) === "1"
  } catch {
    return false
  }
}

let open = !seen()

function set(next: boolean) {
  open = next
  listeners.forEach((fn) => fn())
}

export const openYmHelp = () => set(true)
export function closeYmHelp() {
  try {
    localStorage.setItem(KEY, "1")
  } catch {
    /* не страшно: покажем ещё раз при следующем заходе */
  }
  set(false)
}

export const useYmHelpOpen = () =>
  useSyncExternalStore(
    (fn) => (listeners.add(fn), () => void listeners.delete(fn)),
    () => open,
  )
