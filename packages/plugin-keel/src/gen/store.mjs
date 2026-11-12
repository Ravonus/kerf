// Files on disk for the gen step. Private and git-ignored under the cache folder: raw outputs with their
// provenance, and the append-only ledger. Committed beside the recipe: the lock and the bases it names.
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { canonical, sha256, sorted } from './digest.mjs'
import { resolveSlots } from './recipe.mjs'

/** Where raw outputs and the ledger go when no cache folder is given. */
export const defaultCacheDir = (root = process.cwd()) => join(root, '.weft', 'cache', 'gen')

/** Written aside and renamed, so a run stopped half-way leaves no torn file. */
export function writeAtomic(file, bytes) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(`${file}.part`, bytes)
  renameSync(`${file}.part`, file)
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

/**
 * A recipe file with its style bible (relative to the recipe) and resolved slots. A `file#slot` reference reads
 * the other recipe beside this one (`06#plate.sky` reads `06.gen.json`).
 */
export function loadRecipe(file, { deny = [] } = {}) {
  const recipeFile = resolve(file)
  const dir = dirname(recipeFile)
  const recipe = readJson(recipeFile)
  if (typeof recipe?.style !== 'string') throw new Error(`keel gen: ${file} names no \`style\``)
  const styleFile = resolve(dir, recipe.style)
  const style = readJson(styleFile)
  const resolveFrom = (ref) => {
    const [name, slot] = ref.split('#')
    const other = resolve(dir, name.endsWith('.json') ? name : `${name}.gen.json`)
    if (!existsSync(other)) return undefined
    const theirs = readJson(other)
    const found = resolveSlots(theirs, readJson(resolve(dirname(other), theirs.style)), {
      deny,
    }).find((s) => s.name === slot)
    return found && Object.fromEntries(Object.entries(found).filter(([field]) => field !== 'name'))
  }
  const slots = resolveSlots(recipe, style, { deny, resolveFrom })
  return { recipeFile, dir, recipe, style, styleFile, slots, lockFile: join(dir, 'gen.lock.json') }
}

/** The lock beside a recipe: slot → the chosen output's basis and provenance. */
export function readLock(lockFile) {
  return existsSync(lockFile) ? readJson(lockFile) : { lock: 'keel-gen-lock@1', slots: {} }
}

export function writeLock(lockFile, lock) {
  writeAtomic(lockFile, `${JSON.stringify(sorted(lock), null, 2)}\n`)
}

/** A basis, committed under `<recipe dir>/basis/<digest16>.kmx`; the path is relative to the lock. */
export function writeBasis(dir, bytes) {
  const digest = sha256(bytes)
  const file = `basis/${digest.slice(0, 16)}.kmx`
  if (!existsSync(join(dir, file))) writeAtomic(join(dir, file), bytes)
  return { file, digest }
}

const rawDir = (cacheDir, request) => join(cacheDir, 'raw', request)

/** A request's raw outputs, or `undefined` when they are not all there. Provenance is written last, so it marks a whole set. */
export function readRaw(cacheDir, request) {
  const dir = rawDir(cacheDir, request)
  if (!existsSync(join(dir, 'provenance.json'))) return undefined
  const provenance = readJson(join(dir, 'provenance.json'))
  const candidates = provenance.outputs.map((_, i) => {
    const path = join(dir, `${i}.png`)
    return { path, bytes: new Uint8Array(readFileSync(path)) }
  })
  return { candidates, provenance }
}

/** Writes a request's outputs, then its provenance. */
export function writeRaw(cacheDir, request, outputs, provenance) {
  const dir = rawDir(cacheDir, request)
  const candidates = outputs.map((bytes, i) => {
    const path = join(dir, `${i}.png`)
    writeAtomic(path, bytes)
    return { path, bytes }
  })
  writeAtomic(join(dir, 'provenance.json'), `${JSON.stringify(sorted(provenance), null, 2)}\n`)
  return { candidates, provenance }
}

/** The raw file a lock entry chose, for a baked comparison; `undefined` when the cache no longer has it. */
export function rawFile(cacheDir, entry) {
  const file = join(rawDir(cacheDir, entry.request), `${entry.candidate}.png`)
  return existsSync(file) ? file : undefined
}

/** One line on the append-only ledger: every call, refused and failed ones too. */
export function appendLedger(cacheDir, entry) {
  mkdirSync(cacheDir, { recursive: true })
  appendFileSync(join(cacheDir, 'ledger.jsonl'), `${canonical(entry)}\n`)
}
