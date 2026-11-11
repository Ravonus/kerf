// Prop inference while `kerf dev` runs. A listener of its own, hooked at file-change: it posts the changed name to a
// worker and goes back to serving, so nothing here is on the HMR or request path (research 44 §7).

import { Worker } from 'node:worker_threads'

const SOURCE = /\.tsx?$/
const SKIP = /[\\/](node_modules|\.kerf|\.output|dist)[\\/]/

/** @param {{ watcher: any, ws: any, config: any, close: () => Promise<void> }} server */
export function attachProps(server, root, config) {
  const setting = config?.check?.props
  if (setting === false || process.env.KERF_PROPS === 'off') return null
  const worker = new Worker(new URL('./infer/worker.cjs', import.meta.url), {
    workerData: { root, write: setting !== 'manual' },
    stdout: false,
  })
  worker.unref()
  const stats = { saves: 0, ms: [] }
  const post = (file) => {
    if (SOURCE.test(file) && !SKIP.test(file)) worker.postMessage(file)
  }
  for (const event of ['change', 'add', 'unlink']) server.watcher.on(event, post)

  const logger = server.config?.logger ?? console
  worker.on('message', (msg) => {
    if (msg.type === 'failed') return logger.warn?.(`kerf props: ${msg.message}`)
    if (msg.type === 'wrote')
      return logger.info?.(`kerf props: wrote the inferred type in ${msg.file}`)
    if (msg.type !== 'done') return
    stats.saves++
    stats.ms.push(msg.ms)
    if (!msg.changed) return
    const errors = msg.diagnostics.filter((d) => d.severity === 'error')
    for (const d of msg.diagnostics)
      logger.warn?.(`${d.file}:${d.line}  ${d.code} ${d.severity}  ${d.why}\n    fix: ${d.help}`)
    server.ws.send({ type: 'custom', event: 'kerf:props', data: msg.diagnostics })
    // A save's HMR update has cleared any earlier overlay already, so this only ever shows the current errors.
    if (errors.length)
      server.ws.send({
        type: 'error',
        err: {
          message: errors.map((d) => `${d.file}:${d.line} ${d.code}: ${d.why}`).join('\n'),
          stack: '',
          plugin: 'kerf:props',
        },
      })
  })
  worker.on('error', (e) => logger.warn?.(`kerf props stopped: ${e.message}`))

  const close = server.close.bind(server)
  server.close = async () => {
    worker.postMessage('close')
    return close()
  }
  return { worker, stats }
}
