const BASE = 500
export const CAP = 30_000

/** Full jitter: anywhere from 0 to 0.5 s, 1 s, 2 s … 30 s. */
export const backoff = (attempt: number, random = Math.random) =>
  random() * Math.min(CAP, BASE * 2 ** attempt)
