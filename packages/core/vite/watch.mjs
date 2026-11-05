import { statSync } from 'node:fs'

/**
 * The watcher takes one change per file per 50ms and drops the rest with no later event, so a save right after
 * another is never seen and the page stays on the file before it. A fix right after a syntax error was stuck that
 * way. Look again once the window has passed.
 */
export function watchChanges(server) {
  const stamp = (file) => {
    try {
      return statSync(file).mtimeMs
    } catch {
      return undefined
    }
  }
  server.watcher.on('change', (file) => {
    const at = stamp(file)
    setTimeout(() => stamp(file) !== at && server.watcher.emit('change', file), 75).unref?.()
  })
}
