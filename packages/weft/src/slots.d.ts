// Slot modules @weft-js/core/surface imports dynamically. `.weft/slots.d.ts` declares the bound ones more precisely.
declare module 'weft:slot/*' {
  export const provider: unknown
  export const load: (key?: string) => Promise<unknown>
}
