/** Number of prices kept per stock for its sparkline. */
export const HISTORY_LEN = 20

/** Live state per stock id: the latest price and the last `HISTORY_LEN` prices, oldest first. */
export type LiveState = Record<string, { price: number; history: number[] }>
