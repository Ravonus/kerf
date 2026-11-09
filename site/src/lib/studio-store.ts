// Keeping a studio config: in localStorage, and in a share link.
import type { StudioConfig } from './studio'

const plain = (v: unknown): v is StudioConfig =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

const STORE = 'weft:site:theme-studio'
const toBase64 = (s: string) => btoa(String.fromCodePoint(...new TextEncoder().encode(s)))
const fromBase64 = (s: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.codePointAt(0)!))

/** A link that opens the studio on this config. */
export const shareLink = (config: StudioConfig) =>
  `${location.origin}${location.pathname}#t=${encodeURIComponent(toBase64(JSON.stringify(config)))}`

/** The config from the link, else the last one kept here, else none. */
export function loadConfig(): StudioConfig | undefined {
  try {
    const shared = /[#&]t=([^&]+)/.exec(location.hash)?.[1]
    const text = shared ? fromBase64(decodeURIComponent(shared)) : localStorage.getItem(STORE)
    const parsed: unknown = text ? JSON.parse(text) : undefined
    return plain(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

export function keepConfig(config: StudioConfig) {
  try {
    localStorage.setItem(STORE, JSON.stringify(config))
  } catch {}
}
