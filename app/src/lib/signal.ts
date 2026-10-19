// Сигнал «Bring the action». По умолчанию — src/assets/bring-the-action.mp3;
// можно выбрать свой аудиофайл, он хранится в IndexedDB этого браузера.

import { idbDel, idbGet, idbSet } from "./idb"
import defaultSignalUrl from "@/assets/bring-the-action.mp3"

const KEY = "bta"

let customUrl: string | null = null
let customName: string | null = null
const listeners = new Set<() => void>()

export async function initSignal() {
  try {
    const file = await idbGet<File>(KEY)
    if (file) {
      customUrl = URL.createObjectURL(file)
      customName = file.name
      listeners.forEach((fn) => fn())
    }
  } catch {
    /* IndexedDB недоступна — останется стандартный звук */
  }
}

export async function setCustomSignal(file: File | null) {
  if (customUrl) URL.revokeObjectURL(customUrl)
  customUrl = file ? URL.createObjectURL(file) : null
  customName = file?.name ?? null
  try {
    await (file ? idbSet(KEY, file) : idbDel(KEY))
  } catch {
    /* сохранится только до перезагрузки */
  }
  listeners.forEach((fn) => fn())
}

export const getSignalName = () => customName
export const subscribeSignal = (fn: () => void) => (listeners.add(fn), () => listeners.delete(fn))

// Стандартный сигнал; в сборке одним файлом встраивается как data:-адрес
const DEFAULT_URL = defaultSignalUrl

const sfx = new Audio(DEFAULT_URL)
sfx.preload = "auto"

export function playSignal(): Promise<void> {
  return new Promise((resolve) => {
    const url = new URL(customUrl ?? DEFAULT_URL, location.href).href
    if (sfx.src !== url) sfx.src = url
    sfx.currentTime = 0
    sfx.onended = sfx.onerror = () => resolve()
    sfx.play().catch(() => resolve())
    setTimeout(resolve, 8000)
  })
}

export function stopSignal() {
  sfx.pause()
}
