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
    for (const environment of Object.values(config.environments)) {
      const create = environment.dev?.createEnvironment
      if (!create) continue
      environment.dev.createEnvironment = async (...args) => startOver(await create(...args))
    }
  },
  transform: {
    filter: { id: /crossws/, code: 'incompatible environment' },
    handler: code => code.replace(GUARD, ''),
  },
})

// Nitro can name an environment to the runner before Vite has made it. Across a process that takes long enough, but
// `self` answers at once: the first request goes to nothing and the environment hangs for good. Start it over now that
// something is listening. `init` names it again. (The worker keeps these on globalThis, and `self` is this process.)
async function startOver(environment) {
  const stale = globalThis.__nitro_vite_envs__?.[environment.name]
  if (!stale) return environment
  globalThis.__nitro_vite_envs__[environment.name] = undefined
  await stale.runner.close()
  return environment
}
