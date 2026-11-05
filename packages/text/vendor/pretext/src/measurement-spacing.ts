// Spacing measurements moved from @chenglou/pretext 1.0.0.
import type { EngineProfile } from './measurement-profile.js'

const MAX_APP_UNITS = (1 << 30) - 1

// A text's letter spacing in CSS px as the engine lays it out, 0 by default. CSS and
// Canvas ignore a non-finite one, which Pretext refuses rather than guess at. Gecko's
// whole app units are the float32 times 60, rounded half away from zero and clamped
// (DefaultLengthToAppUnits, ServoStyleConstsInlines.h:584-595), and a spacing that
// rounds to none keeps the text's ligatures (nsLayoutUtils.cpp:6896-6904).
export function readLetterSpacing(letterSpacing: number | undefined, profile: EngineProfile): number {
  const value = letterSpacing ?? 0
  if (!Number.isFinite(value)) throw new RangeError(`letterSpacing must be a finite number of CSS px, not ${value}`)
  if (!profile.letterSpacingInAppUnits) return value
  const units = Math.fround(Math.fround(value) * 60)
  return Math.min(Math.round(Math.abs(units)), MAX_APP_UNITS) * Math.sign(units) / 60
}

// A zero per segment, where per-segment widths start, pushed in a loop: Array.from over
// `{ length }` reads every index off the object and calls its map function for each.
export function zeros(count: number): number[] {
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(0)
  return out
}

