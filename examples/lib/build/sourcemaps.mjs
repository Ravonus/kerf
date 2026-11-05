import { existsSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Point a Vite config at hidden sourcemaps by wrapping it, leaving the app's config itself as it is. */
export function wrapViteConfig(root) {
  const name = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs'].find(
    (f) => existsSync(join(root, f)),
  )
  if (!name) {
    writeFileSync(
      join(root, 'vite.config.mjs'),
      `export default { build: { sourcemap: 'hidden' } }\n`,
    )
    return
  }
  const moved = name.replace('vite.config', 'vite.config.bench-base')
  if (existsSync(join(root, moved))) return
  renameSync(join(root, name), join(root, moved))
  writeFileSync(
    join(root, name),
    `import base from './${moved}'
export default async (env) => { const c = typeof base === 'function' ? await base(env) : await base; return { ...c, build: { ...c.build, sourcemap: 'hidden' } } }\n`,
  )
}

/** Next emits maps from one config switch; the same trick as above. */
export function wrapNextConfig(root) {
  const name = ['next.config.js', 'next.config.mjs'].find((f) => existsSync(join(root, f)))
  if (!name) return
  const moved = name.replace('next.config', 'next.config.bench-base')
  if (existsSync(join(root, moved))) return
  renameSync(join(root, name), join(root, moved))
  writeFileSync(
    join(root, name),
    `import base from './${moved}'\nexport default { ...base, productionBrowserSourceMaps: true }\n`,
  )
}
