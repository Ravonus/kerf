import type { CursorAt, Peer } from '../index'

/** Roster logic with no DOM and no timers of its own, so a test can drive it. */
export const applyPeer = <S>(list: Peer<S>[], p: Peer<S>): Peer<S>[] =>
  list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p]
/** A frame off a transport: no server looked at it, so it's read as hostile. Undefined is refused. */
export function readCursor(text: string): CursorAt | null | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  if (parsed === null) return null
  if (typeof parsed !== 'object') return undefined
  const v = parsed as Record<string, unknown>
  const unit = (n: unknown): n is number => typeof n === 'number' && n >= -0.5 && n <= 1.5
  if (!unit(v.x) || !unit(v.y)) return undefined
  if (v.a !== undefined && (typeof v.a !== 'string' || v.a.length > 128)) return undefined
  return {
    x: v.x,
    y: v.y,
    ...(typeof v.a === 'string' ? { a: v.a } : {}),
    ...(typeof v.style === 'string' && v.style.length <= 16 ? { style: v.style } : {}),
  }
}
