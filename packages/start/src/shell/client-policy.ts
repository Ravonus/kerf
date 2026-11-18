// The build flag closes legacy browser transports even before the entry mounts.
declare const __KERF_SHELL__: boolean | undefined

let mounted = false

/** Keep programmatic shell entries on the same transport policy as generated entries. */
export function markShellClient() {
  mounted = true
}

/** Whether the browser must refuse legacy peer transports. */
export const shellClient = () =>
  mounted || (typeof __KERF_SHELL__ !== 'undefined' && __KERF_SHELL__)
