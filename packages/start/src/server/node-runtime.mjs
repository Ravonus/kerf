// Keep Nitro's Node transport, fetch, upgrades, traces and scheduled tasks behind the awaited boot barrier.
import '#nitro/virtual/polyfills'
import {
  NodeRequest,
  plugins,
  serve,
  wsAdapter,
  startScheduleRunner,
  resolveWebsocketHooks,
} from '#nitro/virtual/kerf-node-config'
import { tracingSrvxPlugins } from '#nitro/virtual/tracing'
import { useNitroApp } from 'nitro/app'
import { fetchViteEnv } from 'nitro/vite/runtime'
import { BOOT_REQUEST, isDraining, onShutdown } from './shutdown.mjs'

function draining(path) {
  const live = path === '/_kerf/health'
  return Response.json(
    { ok: live },
    { status: live ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  )
}

function listener(app) {
  const port = Number.parseInt(process.env.NITRO_PORT ?? process.env.PORT ?? '')
  const hostname = process.env.NITRO_HOST || process.env.HOST
  const cert = process.env.NITRO_SSL_CERT
  const key = process.env.NITRO_SSL_KEY
  return serve({
    port: Number.isNaN(port) ? 3000 : port,
    hostname,
    tls: cert && key ? { cert, key } : undefined,
    manual: true,
    gracefulShutdown: false,
    plugins: [...tracingSrvxPlugins],
    fetch: (request) =>
      isDraining() ? draining(new URL(request.url).pathname) : app.fetch(request),
  })
}

function upgrade(server) {
  const { handleUpgrade } = wsAdapter({ resolve: resolveWebsocketHooks })
  server.node.server.on('upgrade', (req, socket, head) => {
    if (isDraining())
      return socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n')
    return handleUpgrade(req, socket, head, new NodeRequest({ req, upgrade: { socket, head } }))
  })
}

/** Open the listener only after all required initializers have settled successfully. */
export async function start(stage) {
  const app = useNitroApp()
  // The pinned HookableCore stops at the first rejection. Snapshot its callbacks so each gets a chance to close.
  onShutdown(
    'Nitro close hooks',
    () => {
      const hooks = app.hooks?._hooks.close ?? []
      const settled = [...hooks].reverse().map(async (hook) => hook())
      return Promise.allSettled(settled).then((results) => {
        const errors = results
          .filter((result) => result.status === 'rejected')
          .map((result) => result.reason)
        if (errors.length) throw new AggregateError(errors, errors.map(String).join(' | '))
      })
    },
    'cleanup',
  )
  for (const [name, load] of plugins) {
    if (isDraining()) return
    stage(`Nitro plugin ${name}`)
    const { default: plugin } = await load()
    if (isDraining()) return
    await plugin(app)
  }
  if (isDraining()) return
  // Nitro resets its dispatcher after plugins register routes or middleware.
  app.h3['~dispatch'] = app.h3['~composed'] = undefined
  stage('Kerf application startup')
  const request = new Request('http://localhost/_kerf/ready')
  Object.defineProperty(request, BOOT_REQUEST, { value: true })
  await fetchViteEnv('ssr', request)
  if (isDraining()) return
  stage('Node HTTP listener')
  const server = listener(app)
  onShutdown('HTTP drain', () => server.close())
  if (import.meta._websocket) upgrade(server)
  await server.serve()
  if (import.meta._tasks && !isDraining()) {
    stage('Nitro schedules')
    const { stop } = startScheduleRunner({ waitUntil: server.waitUntil }) ?? {}
    if (stop) onShutdown('Nitro schedules', stop)
  }
}
