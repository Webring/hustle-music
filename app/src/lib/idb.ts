// Небольшое хранилище файлов в IndexedDB (свой сигнал, свой трек для репитера)

const DB = "hustle-player"
const STORE = "files"

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const req = fn(open.result.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result as T)
      req.onerror = () => reject(req.error)
    }
  })
}

export const idbGet = <T>(key: string) => idb<T | undefined>("readonly", (s) => s.get(key))
export const idbSet = (key: string, value: unknown) => idb("readwrite", (s) => s.put(value, key))
export const idbDel = (key: string) => idb("readwrite", (s) => s.delete(key))
