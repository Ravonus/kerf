// localStorage for the per-browser settings the watchlist remembers. Storage can be missing or blocked, so every
// access is guarded and the app works without it.

export function stored(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // not persisted
  }
}
