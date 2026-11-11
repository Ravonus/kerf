// Slot modules @kerf-js/core/surface imports dynamically. `.kerf/slots.d.ts` declares the bound ones more precisely.
declare module 'kerf:slot/*' {
  export const provider: unknown
  export const load: (key?: string) => Promise<unknown>
}
