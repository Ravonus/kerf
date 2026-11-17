import { createServer } from 'node:http'
import { onShutdown } from '../../src/server/shutdown.ts?ssr'
import shutdownPlugin from '../../src/shutdown-plugin.mjs'

let serverDrained
shutdownPlugin({
  hooks: {
    hook: (_name, callback) => {
      serverDrained = callback
    },
  },
})

// Match srvx: close the listener on a signal, but leave unrelated handles alone.
const server = createServer((_req, res) =>
  setTimeout(() => {
    res.setHeader('connection', 'close')
    res.end('ok')
  }, 500),
)
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(serverDrained))
onShutdown(
  () =>
    new Promise((resolve) => {
      setTimeout(resolve, Number(process.env.STOP_DELAY || 0))
    }),
)
setInterval(() => {}, 1000)
server.listen(0, '127.0.0.1', () => console.log(server.address().port))
