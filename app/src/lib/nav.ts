import { useSyncExternalStore } from "react"

export type PageId = "player" | "tracks" | "repeater"

let page: PageId = "player"
const listeners = new Set<() => void>()

export function setPage(next: PageId) {
  page = next
  listeners.forEach((fn) => fn())
  window.scrollTo({ top: 0 })
}

export function usePage() {
  return useSyncExternalStore(
    (fn) => (listeners.add(fn), () => void listeners.delete(fn)),
    () => page,
  )
}
