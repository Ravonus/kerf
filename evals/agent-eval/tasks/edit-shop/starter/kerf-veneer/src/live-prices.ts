// Prices are integer cents. IDs are lower-case product names.
export type PriceUpdate = { id: string; price: number }

/** Subscribe to price updates and stop listening when the returned function is called. */
export function subscribePrices(callback: (update: PriceUpdate) => void) {
  const receive = (event: Event) => callback((event as CustomEvent<PriceUpdate>).detail)
  window.addEventListener('kerf-price-update', receive)
  return () => window.removeEventListener('kerf-price-update', receive)
}
