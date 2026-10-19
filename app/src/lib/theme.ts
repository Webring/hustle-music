import { useSyncExternalStore } from "react"

// Светлая / тёмная / как в системе. Класс .dark на <html>, как ждёт shadcn.
export type ThemeMode = "light" | "dark" | "system"

const KEY = "hustle-player:theme"
const media = window.matchMedia("(prefers-color-scheme: dark)")
const listeners = new Set<() => void>()

let mode: ThemeMode = (() => {
  try {
    const v = localStorage.getItem(KEY)
    return v === "light" || v === "dark" ? v : "system"
  } catch {
    return "system"
  }
})()

const resolved = () => (mode === "system" ? (media.matches ? "dark" : "light") : mode)

function apply() {
  const root = document.documentElement
  root.classList.toggle("dark", resolved() === "dark")
  root.style.colorScheme = resolved()
  listeners.forEach((fn) => fn())
}

media.addEventListener("change", () => mode === "system" && apply())
apply()

export function setThemeMode(next: ThemeMode) {
  mode = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* не страшно */
  }
  apply()
}

const subscribe = (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn))

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => mode)
  const resolvedTheme = useSyncExternalStore(subscribe, resolved)
  return { theme, resolvedTheme, setTheme: setThemeMode }
}
