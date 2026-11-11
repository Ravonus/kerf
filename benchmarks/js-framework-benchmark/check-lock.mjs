// Check the npm projection against the pnpm lock and all declared dependency edges.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const base = join(dirname(fileURLToPath(import.meta.url)), 'keyed/kerf')
const manifest = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8'))
const lock = JSON.parse(readFileSync(process.argv[2] ?? join(base, 'package-lock.json'), 'utf8'))
const pnpm = readFileSync(join(base, 'pnpm-lock.yaml'), 'utf8')
const integrities = new Map()
for (const match of pnpm.matchAll(
  /^  (?:'([^']+)'|([^ :]+)):\n    resolution: \{integrity: ([^}]+)\}/gm,
)) {
  integrities.set(match[1] ?? match[2], match[3])
}
const fail = (message) => {
  throw new Error(message)
}
if (lock.lockfileVersion !== 3 || lock.name !== manifest.name || lock.version !== manifest.version)
  fail('Wrong lockfile root')
const root = lock.packages['']
for (const group of ['dependencies', 'devDependencies']) {
  if (JSON.stringify(root[group]) !== JSON.stringify(manifest[group])) fail(`Wrong root ${group}`)
}
let count = 0
const seen = new Set()
for (const [path, node] of Object.entries(lock.packages)) {
  if (path) {
    const name = path.slice(path.lastIndexOf('node_modules/') + 13)
    const key = `${name}@${node.version}`
    if (!integrities.has(key) || integrities.get(key) !== node.integrity)
      fail(`Integrity mismatch: ${key}`)
    if (!node.resolved?.startsWith('https://registry.npmjs.org/'))
      fail(`Missing registry URL: ${key}`)
    seen.add(key)
    count++
  }
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const name of Object.keys(node[group] ?? {})) {
      let parent = path
      let found = false
      for (;;) {
        if (lock.packages[`${parent ? `${parent}/` : ''}node_modules/${name}`]) {
          found = true
          break
        }
        const at = parent.lastIndexOf('/node_modules/')
        if (at < 0) {
          if (parent && lock.packages[`node_modules/${name}`]) found = true
          break
        }
        parent = parent.slice(0, at)
      }
      if (!found) fail(`Missing ${group} node ${name} from ${path || 'root'}`)
    }
  }
}
console.log(
  `Verified ${count} npm nodes and their dependency edges against ${integrities.size} pnpm integrities`,
)

const store = join(base, 'node_modules/.pnpm')
if (existsSync(store)) {
  const projected = new Set(
    Object.entries(lock.packages)
      .filter(([path]) => path)
      .map(([path, node]) => {
        const name = path.slice(path.lastIndexOf('node_modules/') + 13)
        return `${name}@${node.version}`
      }),
  )
  let installed = 0
  for (const entry of readdirSync(store)) {
    const modules = join(store, entry, 'node_modules')
    if (!existsSync(modules)) continue
    for (const name of readdirSync(modules)) {
      const scope = join(modules, name)
      const paths = name.startsWith('@')
        ? readdirSync(scope).map((child) => join(scope, child))
        : [scope]
      for (const path of paths) {
        const file = join(path, 'package.json')
        if (!existsSync(file)) continue
        const pkg = JSON.parse(readFileSync(file, 'utf8'))
        if (!projected.has(`${pkg.name}@${pkg.version}`))
          fail(`Installed package missing: ${pkg.name}@${pkg.version}`)
        installed++
      }
    }
  }
  console.log(`Verified ${installed} installed package links against npm nodes`)
}
