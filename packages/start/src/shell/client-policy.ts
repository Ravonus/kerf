// The build flag closes legacy browser transports even before the entry mounts.
import { ShellDataError } from './operation'

declare const __KERF_SHELL__: boolean | undefined

let build: string | null | undefined

/** Keep programmatic shell entries on the same transport policy as generated entries. */
export function markShellClient(id: string | null) {
  build = id
}

/** Whether the browser must refuse legacy peer transports. */
export const shellClient = () =>
  build !== undefined || (typeof __KERF_SHELL__ !== 'undefined' && __KERF_SHELL__)

/** The release's build, never one learned from the peer. */
export function shellBuild() {
  if (!build) throw new ShellDataError('invalid')
  return build
}
