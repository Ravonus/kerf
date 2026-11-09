import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fingerprint, walkBuild } from './fingerprint.mjs'
import { run } from './run.mjs'
import { wrapNextConfig, wrapViteConfig } from './sourcemaps.mjs'

const FOR_MAPS = '.bench-maps'
const CONFIGS = [
  'vite.config.ts',
  'vite.config.mts',
  'vite.config.js',
  'vite.config.mjs',
  'next.config.js',
  'next.config.mjs',
]

function collectMaps(v, held) {
  const keep = join(v.root, FOR_MAPS)
  rmSync(keep, { recursive: true, force: true })
  mkdirSync(keep)
  const maps = []
  for (const d of held)
    if (existsSync(join(v.root, d)))
      walkBuild(join(v.root, d), (f) => {
        if (/\.m?js\.map$/.test(f)) {
          const js = f.replace(/\.map$/, '')
          if (existsSync(js)) {
            const to = join(keep, `${basename(dirname(f))}__${basename(f)}`)
            copyFileSync(f, to)
            copyFileSync(js, to.replace(/\.map$/, ''))
            maps.push(to)
          }
        }
      })
  return maps
}

function restoreAfterMaps({ v, held, aside, originals }) {
  for (const d of held) {
    rmSync(join(v.root, d), { recursive: true, force: true })
    renameSync(join(aside, d), join(v.root, d))
  }
  rmSync(aside, { recursive: true, force: true })
  for (const f of readdirSync(v.root))
    if (f.includes('.bench-base')) rmSync(join(v.root, f), { force: true })
  for (const f of ['vite.config.mjs'])
    if (!originals.some(([n]) => n === f)) rmSync(join(v.root, f), { force: true })
  for (const [f, b] of originals) writeFileSync(join(v.root, f), b)
}

/**
 * One more build with hidden maps, for attribution only, with the measured output set aside and put back: same hashes or
 * it's reported as a mismatch. Chunks and maps are kept in .bench-maps for later runs that reuse this build.
 */
export async function buildWithMaps(v) {
  if (!v.stack.sourcemap) return null
  const measured = v.fresh.hashes,
    aside = join(v.root, '.bench-aside'),
    config = CONFIGS.filter((f) => existsSync(join(v.root, f)))
  const originals = config.map((f) => [f, readFileSync(join(v.root, f))])
  rmSync(aside, { recursive: true, force: true })
  mkdirSync(aside)
  const held = v.stack.out.filter((d) => existsSync(join(v.root, d)))
  for (const d of held) renameSync(join(v.root, d), join(aside, d))
  try {
    ;({ vite: wrapViteConfig, next: wrapNextConfig })[v.stack.sourcemap](v.root)
    await run(v.build, { cwd: v.root, env: { NODE_ENV: 'production', ...v.buildEnv }, log: v.log })
    const maps = collectMaps(v, held)
    const same = [...fingerprint(v.root, v).hashes].filter((h) => measured.has(h)).length
    return { maps, same, total: measured.size }
  } finally {
    restoreAfterMaps({ v, held, aside, originals })
  }
}
