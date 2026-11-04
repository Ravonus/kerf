import type { StorageLike } from './scope'

/** An in-memory StorageLike: `persist: 'memory'`, and the fallback where Web Storage is missing or blocked. */
export function memoryStorage(): StorageLike {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  }
}
