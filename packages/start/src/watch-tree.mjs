// A recursive `fs.watch` that can fail without taking the process with it. A sandbox or a busy machine limits
// watchers (EMFILE, ENOSPC), and an FSWatcher's 'error' with no listener is an uncaught exception.

import { watch } from 'node:fs'

/**
 * `fs.watch(dir, { recursive: true }, listener)`, or null when it can't watch. Whether it can't start or fails later,
 * `warn` hears why once and the watcher is closed: the caller goes on without it.
 */
export function watchTree(dir, listener, warn) {
  let watcher
  try {
    watcher = watch(dir, { recursive: true }, listener)
  } catch (error) {
    warn(error)
    return null
  }
  watcher.on('error', (error) => {
    warn(error)
    watcher.close()
  })
  return watcher
}

/** What a watcher's failure was, for a warning: its code (EMFILE) when it has one. */
export const watchFailure = (error) => error?.code ?? error?.message ?? String(error)
