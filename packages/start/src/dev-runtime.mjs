// `weft dev` for an app with sockets on Bun and Deno. Nitro's dev server assumes a Node worker for websockets: its
// entry takes crossws's Node adapter, which refuses to load there, and a worker on either runtime can't take the
// upgrade. So the app runs in Vite's own process (the `self` runner), where Vite's HTTP server hands the upgrade over
// and the adapter works. Node, and any app without a channel or sharedState, gets none of this.

const alternate = Boolean(process.versions.bun || process.versions.deno)

export const devRunner = sockets => (alternate && sockets ? 'self' : undefined)

const GUARD = /if \("Deno" in globalThis \|\| "Bun" in globalThis\) throw new Error\([^)]*\);?/

export const devSockets = () => ({
  name: 'weft:dev-sockets',
  apply: 'serve',
  enforce: 'post',
  configResolved(config) {
    for (const [name, environment] of Object.entries(config.environments)) {
      const create = environment.dev?.createEnvironment
      if (!create || environment.consumer !== 'server') continue
      const release = hold(name)
      environment.dev.createEnvironment = async (...args) => release(await create(...args))
    }
  },
  transform: {
    filter: { id: /crossws/, code: 'incompatible environment' },
    handler: code => code.replace(GUARD, ''),
  },
})

// Nitro can name an environment to the runner before Vite has made it. Across a process that takes long enough, but
// `self` answers at once: the first request goes to nothing and the environment hangs for good. So each one is held
// until it exists, and `init` names it again. (The worker keeps these on globalThis, and `self` is this process.)
const HELD = { hasEvaluated: () => false, reload: async () => {}, fetch: async () => new Response('starting', { status: 503 }) }

function hold(name) {
  const environments = (globalThis.__nitro_vite_envs__ ??= {})
  environments[name] = HELD
  return environment => {
    environments[name] = undefined
    return environment
  }
}
