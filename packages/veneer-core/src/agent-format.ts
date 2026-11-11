/** Milliseconds as seconds, to a tenth. */
export const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`
/** Seconds as m:ss. */
export const formatClock = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
/** A token count, shortened to k or M. */
export const formatTokens = (n: number) =>
  n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)

/** 07 §1.2: high at 80%, full at 95%. */
export const contextLevel = (ratio: number) =>
  ratio >= 0.95 ? 'full' : ratio >= 0.8 ? 'high' : undefined
