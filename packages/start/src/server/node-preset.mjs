// The stock Nitro 3 Node entry starts listening while promises returned by plugins are still pending.
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const collector = '#nitro/virtual/kerf-plugins'
const config = '#nitro/virtual/kerf-node-config'
const host = fileURLToPath(new URL('./node-host.mjs', import.meta.url))
const runtime = fileURLToPath(new URL('./node-runtime.mjs', import.meta.url))

/** Retain Nitro's resolved plugin order and leave non-Node and custom entries with their own lifecycle. */
export function ownNodePreset(nitro, site) {
  const options = nitro.options
  if (
    options.dev ||
    options.static ||
    !/[/\\]node[/\\]runtime[/\\]node-server(?:\.mjs)?$/.test(options.entry ?? '')
  )
    return
  const require = createRequire(options.entry)
  const internal = join(dirname(options.entry), '../../../runtime/internal')
  const plugins = [...new Set(options.plugins)]
  options.entry = '#nitro/virtual/kerf-node-entry'
  options.plugins = [collector]
  // Nitro still creates its hook-aware h3 app and uses its ordinary useNitroApp singleton.
  options.virtual[collector] = 'export default function collect() {}'
  options.virtual[config] = `
    export { NodeRequest, serve } from ${JSON.stringify(require.resolve('srvx/node'))}
    export { default as wsAdapter } from ${JSON.stringify(require.resolve('crossws/adapters/node'))}
    export { startScheduleRunner } from ${JSON.stringify(join(internal, 'task.mjs'))}
    export { resolveWebsocketHooks } from ${JSON.stringify(join(internal, 'app.mjs'))}
    export const plugins = [
      ${plugins.map((plugin) => `[${JSON.stringify(relative(options.rootDir, plugin))}, () => import(${JSON.stringify(plugin)})]`).join(',\n')}
    ]
  `
  options.virtual[options.entry] = `
    import { runNodeHost } from ${JSON.stringify(host)}
    await runNodeHost(() => import(${JSON.stringify(runtime)}), ${JSON.stringify(site?.log ?? 'json')})
  `
}
