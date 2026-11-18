// Nitro and the SSR entry can live in separate bundles in the same serving process.
export const shutdownKey = Symbol.for('kerf.start.shutdown')
export const BOOT_REQUEST = Symbol.for('kerf.start.boot')
const host = () => globalThis[shutdownKey]

/** Whether the owned process has stopped admitting application work. */
export const isDraining = () => host()?.stopping === true

/** A named shutdown step from either bundle. Embedded handlers install no process policy. */
export function onShutdown(name, stop) {
  host()?.steps.push([name, stop])
}
