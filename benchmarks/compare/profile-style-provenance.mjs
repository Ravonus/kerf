// Prove the known pre-transform by replaying captured Git code, never by stripping a matching prefix.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, lstatSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const hash = (data) => createHash('sha256').update(data).digest('hex')
const gitFile = (repo, commit, path) =>
  execFileSync('git', ['show', `${commit}:${path}`], { cwd: repo })

/** Only the captured keyed hook can justify this additive, single-line source transformation. */
export function keyedProvenance(repo, commit, path, content, original) {
  const pluginPath = 'packages/core/vite/config-plugins.mjs',
    file = join(repo, pluginPath),
    expected = gitFile(repo, commit, pluginPath)
  const stat = lstatSync(file)
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'Invalid transform module')
  assert.equal(hash(readFileSync(file)), hash(expected), 'Transform module differs from Git')
  assert.equal(
    hash(readFileSync(join(repo, path))),
    hash(original),
    'Transform input differs from Git',
  )
  const require = createRequire(join(repo, 'package.json')),
    { keyed } = require(file)
  assert.equal(keyed.name, 'weft:keyed')
  assert.equal(keyed.enforce, 'pre')
  const input = original.toString('utf8'),
    id = join(repo, path),
    { filter } = keyed.transform
  assert.deepEqual(Buffer.from(input), original, 'Invalid UTF-8 transform input')
  assert.ok(
    filter.id.include.test(id) && !filter.id.exclude.test(id) && filter.code.test(input),
    'Captured keyed filter does not select this input',
  )
  const result = keyed.transform.handler(input, id)
  assert.equal(result?.map, null, 'Unexpected keyed map contract')
  assert.equal(result?.code, content, 'Mapped source lacks captured transform provenance')
  assert.ok(content.endsWith(input), 'Transform changed authored contents')
  const prefix = content.slice(0, content.length - input.length)
  assert.ok(prefix.startsWith('import ') && prefix.endsWith(';') && !/[\r\n]/.test(prefix))
  assert.equal(hash(readFileSync(file)), hash(expected), 'Transform module changed during replay')
  return {
    hook: keyed.name,
    pluginPath,
    pluginSha256: hash(expected),
    inputSha256: hash(original),
    outputSha256: hash(Buffer.from(content)),
    prefix,
    prefixUtf16Columns: prefix.length,
  }
}

/** Imported-prefix positions have no authored location; only first-line authored columns shift. */
export function authoredPosition(source, found) {
  const line = found.originalLine,
    column = found.originalColumn,
    prefix = source.provenance?.prefixUtf16Columns ?? 0
  if (line === 0 && column < prefix)
    return {
      ...source,
      line: null,
      column: null,
      status: 'Verified injected import; no Git location',
    }
  return {
    ...source,
    line: line + 1,
    column: column + 1 - (line === 0 ? prefix : 0),
    name: found.name ?? null,
  }
}
