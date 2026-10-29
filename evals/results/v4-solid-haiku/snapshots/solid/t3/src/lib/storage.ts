// localStorage can be missing or throw (private mode, blocked storage); the app then just forgets between loads.

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore: the setting still works for this page view
  }
}
