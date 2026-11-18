import { createServer } from 'node:http'
import { sleep } from '../../../../scripts/lib/sleep.mjs'
import { runNodeHost } from '../../src/server/node-host.mjs'
import { onShutdown } from '../../src/server/shutdown.mjs?ssr'

await runNodeHost(
  () =>
    Promise.resolve({
      start() {
        let inFlight = 0
        const server = createServer((_req, res) => {
          inFlight++
          setTimeout(() => {
            res.setHeader('connection', 'close')
            inFlight--
            res.end('ok')
          }, 500)
        })
        onShutdown(
          'HTTP drain',
          () =>
            new Promise((ok, no) => {
              server.close((error) => (error ? no(error) : ok()))
            }),
        )
        onShutdown(
          'app cleanup',
          async () => {
            if (process.env.STOP_FAIL) throw new Error('shutdown test marker')
            if (inFlight) throw new Error('resources closed before HTTP drained')
            await sleep(Number(process.env.STOP_DELAY || 0))
            console.log('stopped')
          },
          'cleanup',
        )
        setInterval(() => {}, 1000)
        server.listen(0, '127.0.0.1', () => console.log(server.address().port))
        process.on('SIGUSR1', () => {
          if (process.env.TEST_REJECTION) void Promise.reject(new Error('timer rejection marker'))
          else throw new Error('timer exception marker')
        })
      },
    }),
  'json',
)
