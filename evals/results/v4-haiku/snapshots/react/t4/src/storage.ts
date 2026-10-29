// localStorage can be missing or throw (private mode, blocked storage); the app works without it.
export function loadString(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function saveString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not persisted; the page still works.
  }
}

export function loadFlag(key: string): boolean {
  return loadString(key, '0') === '1'
}

export function saveFlag(key: string, value: boolean): void {
  saveString(key, value ? '1' : '0')
}
