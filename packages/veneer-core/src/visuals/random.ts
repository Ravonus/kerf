/** A deterministic stream for decorative geometry, stable across runtimes. */
export function visualRandom(seed: string | number) {
  const key = String(seed)
  let value = 2166136261
  for (let i = 0; i < key.length; i++) value = Math.imul(value ^ key.charCodeAt(i), 16777619)
  return () => {
    value = (value + 0x6d2b79f5) | 0
    let mixed = Math.imul(value ^ (value >>> 15), value | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

/** A bounded count for visual effects, including non-finite inputs. */
export function visualCount(value: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(value))) : 0
}
