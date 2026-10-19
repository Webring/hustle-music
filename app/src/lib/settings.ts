import { useSyncExternalStore } from "react"

export type Interval = { from: number; to: number }

export type Settings = {
  intervals: Interval[]
  shuffle: boolean
  timed: boolean // режим «90 секунд»
  timedSec: number
  repeat: boolean
  bta: boolean // Bring the action при смене трека
  vol: number
  ymView: YmView // как показывать виджет Яндекс Музыки
}

// float — окно в углу, embed — внутри карточки плеера,
// button — виджет скрыт, в углу кнопка «Яндекс Музыка»; hidden — скрыт полностью
export const YM_VIEWS = ["float", "embed", "button", "hidden"] as const
export type YmView = (typeof YM_VIEWS)[number]


const DEFAULTS: Settings = {
  intervals: [{ from: 92, to: 118 }],
  shuffle: true,
  timed: false,
  timedSec: 90,
  repeat: false,
  bta: true,
  vol: 90,
  ymView: "button",
}

const KEY = "hustle-player:settings"

// Интервалы в адресе: #bpm=92-118,91-119 — ссылкой можно поделиться подборкой
function intervalsFromHash(): Interval[] | null {
  const m = location.hash.match(/^#bpm=(\d+-\d+(?:,\d+-\d+)*)$/)
  if (!m) return null
  return m[1].split(",").map((pair) => {
    const [a, b] = pair.split("-").map(Number)
    return { from: Math.min(a, b), to: Math.max(a, b) }
  })
}
export const intervalsToHash = (list: Interval[]) => "#bpm=" + list.map((i) => `${i.from}-${i.to}`).join(",")

function load(): Settings {
  let saved: Partial<Settings> = {}
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || "{}")
  } catch {
    /* приватный режим и т.п. */
  }
  const s = { ...DEFAULTS, ...saved }
  if (!YM_VIEWS.includes(s.ymView)) s.ymView = DEFAULTS.ymView // режим из старой версии
  const fromHash = intervalsFromHash()
  if (fromHash?.length) s.intervals = fromHash
  return s
}

let state = load()
const listeners = new Set<() => void>()

export const getSettings = () => state
export function setSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* не страшно */
  }
  listeners.forEach((fn) => fn())
}
export function useSettings() {
  return useSyncExternalStore(
    (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    () => state,
  )
}
