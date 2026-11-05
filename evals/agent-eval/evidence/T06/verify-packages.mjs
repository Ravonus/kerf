// Compare every reachable installed weft package with its candidate tarball.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs'
import { join, relative } from 'node:path'

const [app, scratch, mapFile] = process.argv.slice(2)
if (!app || !scratch || !mapFile) throw new Error('expected app, scratch, tarball map')
const tarballs = JSON.parse(readFileSync(mapFile, 'utf8'))
const required = [
  'core',
  'start',
  'cli',
  'warp',
  'warp-core',
  'warp-icons',
  'compiler-darwin-arm64',
]
const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const results = [],
  seen = new Set()
function verify(name, installed) {
  const spec = tarballs[name]
  if (!spec?.startsWith('file:')) throw new Error(`missing local tarball ${name}`)
  const archive = spec.slice(5)
  const extract = join(scratch, String(results.length))
  mkdirSync(extract, { recursive: true })
  execFileSync('/usr/bin/tar', ['-xzf', archive, '-C', extract])
  const source = join(extract, 'package')
  let count = 0
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else {
        if (!entry.isFile()) throw new Error(`unexpected archive entry ${path}`)
        const dest = join(installed, relative(source, path))
        if (!lstatSync(dest).isFile() || digest(path) !== digest(dest))
          throw new Error(`installed file differs from ${name}: ${relative(source, path)}`)
        count++
      }
    }
  }
  walk(source)
  if (!count) throw new Error(`empty package ${name}`)
  results.push({
    name,
    location: relative(app, installed),
    files: count,
    tarballSha256: digest(archive),
  })
  rmSync(extract, { recursive: true, force: true })
}
function visit(path) {
  const manifest = join(path, 'package.json')
  if (!existsSync(manifest)) return
  const real = realpathSync(path)
  if (seen.has(real)) return
  seen.add(real)
  const { name } = JSON.parse(readFileSync(manifest, 'utf8'))
  if (name?.startsWith('@weft-js/')) verify(name, path)
  scan(join(path, 'node_modules'))
}
function scan(modules) {
  if (!existsSync(modules)) return
  for (const name of readdirSync(modules)) {
    if (name.startsWith('.')) continue
    const path = join(modules, name)
    if (name.startsWith('@')) {
      for (const scoped of readdirSync(path)) visit(join(path, scoped))
    } else visit(path)
  }
}
scan(join(app, 'node_modules'))
for (const name of required) {
  if (!results.some((entry) => entry.name === `@weft-js/${name}`))
    throw new Error(`missing installed @weft-js/${name}`)
}
console.log(JSON.stringify(results))
