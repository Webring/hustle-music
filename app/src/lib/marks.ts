import { useSyncExternalStore } from "react"

// Оценки треков. Лайк — просто пометка. Дизлайк — трек не попадает в плеер,
// но остаётся в общем списке треков. Хранится в localStorage этого браузера.

export type Mark = "like" | "dislike"
type Marks = Record<string, Mark> // ключ — ID трека в Яндекс Музыке

const KEY = "hustle-player:ym-marks"
const listeners = new Set<() => void>()

let marks: Marks = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}")
  } catch {
    return {}
  }
})()

function save(next: Marks) {
  marks = next
  try {
    localStorage.setItem(KEY, JSON.stringify(marks))
  } catch {
    /* не страшно */
  }
  listeners.forEach((fn) => fn())
}

// Повторное нажатие снимает оценку; лайк и дизлайк взаимоисключающие
export function toggleMark(id: string, mark: Mark) {
  const next = { ...marks }
  if (next[id] === mark) delete next[id]
  else next[id] = mark
  save(next)
  return next[id]
}

export const getMarks = () => marks
export const isDisliked = (id: string) => marks[id] === "dislike"

export function useMarks() {
  return useSyncExternalStore(
    (fn) => (listeners.add(fn), () => void listeners.delete(fn)),
    () => marks,
  )
}
