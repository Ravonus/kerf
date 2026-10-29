export type Live = { price: number; history: number[] }
export type LiveMap = Record<string, Live>
export const HISTORY = 20
