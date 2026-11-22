// Nitro starts evaluating each entry as soon as it receives the environment registration.
// Vite creates environments before running configureServer, buildStart and the optimizer's init.
// If the SSR stylesheet crawl reaches the client graph then, Vite can replace the dependency
// metadata for an optimized import while the crawl is still waiting for that import to load.

const alternate = Boolean(process.versions.bun || process.versions.deno)

/** Use Vite's own HTTP server for WebSocket upgrades on Bun and Deno. */
export const devRunner = (sockets) => (alternate && sockets ? 'self' : undefined)

const GUARD = /if \("Deno" in globalThis \|\| "Bun" in globalThis\) throw new Error\([^)]*\);?/
const WORKER_TIMEOUT = 30_000

/** Register Nitro entries after the environments they import through are ready. */
export function devRuntime(refreshPlugins) {
  let nitro
  let register
  let useSelf
  return {
    name: 'kerf:dev-runtime',
    apply: 'serve',
    enforce: 'post',
    nitro: {
      setup(instance) {
        nitro = instance
      },
    },
    configResolved(config) {
      useSelf = (nitro.options.devServer.runner || process.env.NITRO_DEV_RUNNER) === 'self'
      const dev = config.environments.nitro.dev
      const createNitro = dev.createEnvironment
      const held = Promise.withResolvers()
      dev.createEnvironment = async (...args) => {
        try {
          const env = await createNitro(...args)
          register = holdRegistrations(env.devServer, useSelf)
          return env
        } finally {
          held.resolve()
        }
      }
      // Nitro can resend registrations as soon as the worker reports ready, including services
      // still under construction. Install the gate before Nitro starts creating those services.
      for (const [name, environment] of Object.entries(config.environments)) {
        if (name === 'nitro' || environment.consumer !== 'server') continue
        const create = environment.dev.createEnvironment
        environment.dev.createEnvironment = async (...args) => {
          await held.promise
          return create(...args)
        }
      }
    },
    configureServer(server) {
      // Vite creates the replacement server before closing the current one. Nitro's plugin
      // retains its RunnerManager across configs; each server needs to own the runner it closes.
      server.config.inlineConfig.plugins = refreshPlugins()
      const environments = Object.values(server.environments)
      let remaining = environments.length
      for (const environment of environments) {
        const listen = environment.listen.bind(environment)
        environment.listen = async (...args) => {
          await listen(...args)
          if (--remaining === 0) await register()
        }
      }
    },
    closeServer: () => nitro.close(),
    transform: {
      filter: { id: /crossws/, code: 'incompatible environment' },
      handler: (code) => (alternate && useSelf ? code.replace(GUARD, '') : undefined),
    },
  }
}

function holdRegistrations(worker, useSelf) {
  const send = worker.sendMessage
  const entries = new Map()
  worker.sendMessage = (message) => {
    if (message?.type === 'custom' && message.event === 'nitro:vite-env')
      entries.set(message.data.name, message)
    else send.call(worker, message)
  }
  return async () => {
    await worker.waitForReady(WORKER_TIMEOUT)
    worker.sendMessage = send
    for (const [name, message] of entries) {
      // A self runner reuses Nitro's module and its global table across Vite restarts.
      if (useSelf && globalThis.__nitro_vite_envs__)
        globalThis.__nitro_vite_envs__[name] = undefined
      worker.sendMessage(message)
    }
    await registrationsReceived(worker)
  }
}

async function registrationsReceived(worker) {
  const token = 'kerf:dev-registered'
  const settled = Promise.withResolvers()
  const timer = setTimeout(
    () =>
      settled.reject(new Error('Nitro did not register the Vite environments within 30 seconds')),
    WORKER_TIMEOUT,
  )
  const onMessage = (message) => {
    if (message?.type === 'pong' && message.data === token) settled.resolve()
  }
  worker.onMessage(onMessage)
  try {
    worker.sendMessage({ type: 'ping', data: token })
    await settled.promise
  } finally {
    clearTimeout(timer)
    worker.offMessage(onMessage)
  }
}
