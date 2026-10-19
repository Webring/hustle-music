// Одновременно звучит только один плеер: кто начинает играть, тот ставит остальных на паузу.

const owners = new Map<string, () => void>()

export function registerAudio(name: string, pause: () => void) {
  owners.set(name, pause)
}

export function claimAudio(name: string) {
  owners.forEach((pause, n) => n !== name && pause())
}
