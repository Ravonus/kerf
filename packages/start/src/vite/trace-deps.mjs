// The packages a built server loads by name at runtime, which Nitro can't see to copy into `.output`. Nitro's `traceDeps`
// keeps each external and traces it into the build; nf3 warns for an entry no installed package resolves ("could not
// resolve `traceInclude` entry … from any root"), so each one here is listed only when the app has it.

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** Where `name` is installed for code in any of `from`, Node's way: `node_modules/<name>` in each directory up. */
export function packageDir(name, from) {
  for (let dir of from) {
    for (;;) {
      const at = join(dir, 'node_modules', name)
      if (existsSync(join(at, 'package.json'))) return realpathSync(at)
      const up = dirname(dir)
      if (up === dir) break
      dir = up
    }
  }
  return null
}

/** The plugin a generated slot file names, or null: `kerf plugins sync` writes `provider = null` for an unfilled slot. */
function slotProvider(root, slot) {
  const file = join(root, '.kerf', 'slots', slot)
  if (!existsSync(file)) return null
  const text = readFileSync(file, 'utf8')
  if (/^export const provider = null$/m.test(text)) return null
  return /["']?plugin["']?\s*:\s*["']([^"']+)["']/.exec(text)?.[1] ?? ''
}

/**
 * Nitro's `traceDeps` for the app: the media route's sharp, and css-tree and csso under svgo, which read JSON from their
 * packages, when a plugin provides the media slot; and nodemailer for SMTP.
 */
export function traceDeps(root) {
  const pkg = readJson(join(root, 'package.json')) ?? {}
  const direct = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    .map((name) => packageDir(name, [root]))
    .filter(Boolean)
  // what nf3 resolves an entry from: the app, and the packages that declare it (one of the app's own, or theirs)
  const bases = [root, ...direct]
  const deps = []
  const media = slotProvider(root, 'media.server.ts')
  if (media !== null) {
    const provider = media && packageDir(media, bases)
    const from = provider ? [provider, ...bases] : bases
    const svgo = packageDir('svgo', from)
    for (const name of ['css-tree', 'csso'])
      if (packageDir(name, svgo ? [svgo, ...from] : from)) deps.push(`${name}*`)
    if (packageDir('sharp', from)) deps.push('sharp*')
  }
  if (existsSync(join(root, 'node_modules/nodemailer'))) deps.push('nodemailer*')
  return deps.length ? { traceDeps: deps } : {}
}

/**
 * Takumi's addon, which every server's share cards import by name (`og/native.mjs`), as an external of Nitro's
 * prerender bundle. Under pnpm it sits beside @kerf-js/start and not in the app's node_modules, and that bundle
 * resolves without tracing, so it called the import UNRESOLVED_IMPORT; the prerender's `native()` loads
 * @kerf-js/start's own copy. The server's bundle is left to Nitro, which traces the addon into `.output`.
 */
export const externalAddons = () => ({
  name: 'kerf:start:external-addons',
  resolveId: {
    filter: { id: /^@takumi-rs\/core$/ },
    handler: (id) => ({ id, external: true }),
  },
})
