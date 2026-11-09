export const kb = (n) => `${(n / 1024).toFixed(1)} KB`

// A stated rate, not a law: rough score points per unit, so size and time rank against each other at all.
export const PER = { kb: 0.1, hydrateMs: 0.02, heapMB: 0.3 }
