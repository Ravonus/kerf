// Exercise captured hooks, authored coordinates and failed-map preservation without building dashboards.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  symlinkSync,
  realpathSync,
  truncateSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { keyedProvenance, authoredPosition } from './profile-style-provenance.mjs'
import { digest, loadMaps } from './profile-style-maps.mjs'
import { analyzeWithEvidence, preservingAssets } from './profile-style-build.mjs'
import { evidence } from './profile-load-io.mjs'
import { STACKS } from './profile-load-data.mjs'

const original = 'export const value = entries.get("key")\n',
  plugin = 'packages/core/vite/config-plugins.mjs',
  source = 'packages/warp-core/src/form.ts'

async function fixture(task) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'weft-map-provenance-'))),
    repo = join(root, 'repo')
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
  try {
    mkdirSync(join(repo, 'packages/core/vite'), { recursive: true })
    mkdirSync(join(repo, 'packages/warp-core/src'), { recursive: true })
    writeFileSync(join(repo, 'package.json'), '{"type":"module"}')
    writeFileSync(join(repo, source), original)
    writeFileSync(join(repo, plugin), readFileSync(new URL('../../' + plugin, import.meta.url)))
    git('init', '-q')
    git('add', '.')
    git(
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'Captured',
    )
    const commit = git('rev-parse', 'HEAD')
    const content = `import ${JSON.stringify(join(repo, 'packages/core/src/keyed.ts'))};${original}`
    await task({ root, repo, commit, content })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function maps(repo, commit, content) {
  const assets = {},
    raw = {}
  for (const stack of STACKS) {
    const dist = join(repo, 'benchmarks/compare', stack, 'dist')
    mkdirSync(dist, { recursive: true })
    writeFileSync(join(dist, 'index.html'), '<div></div>')
    writeFileSync(join(dist, 'app.js'), 'export const value=1;')
    writeFileSync(join(dist, 'app.css'), 'body{color:red}')
    const payload = {
      version: 3,
      file: 'app.js',
      names: [],
      mappings: 'AAAA',
      sources: [relative(dist, join(repo, source))],
      sourcesContent: [stack === 'weft-warp' ? content : original],
    }
    raw[stack] = Buffer.from(JSON.stringify(payload))
    writeFileSync(join(dist, 'app.js.map'), raw[stack])
    assets[stack] = Object.fromEntries(
      ['index.html', 'app.js', 'app.css'].map((name) => {
        const bytes = readFileSync(join(dist, name))
        return [name, { bytes: bytes.length, sha256: digest(bytes) }]
      }),
    )
  }
  return { pins: { pins: { commit }, assets }, raw }
}

test('captured keyed hook replay proves output, and injected imports get no authored location', () =>
  fixture(({ repo, commit, content }) => {
    const provenance = keyedProvenance(repo, commit, source, content, Buffer.from(original))
    assert.equal(provenance.inputSha256, digest(original))
    assert.equal(provenance.outputSha256, digest(content))
    assert.equal(provenance.pluginSha256, digest(readFileSync(join(repo, plugin))))
    const { pins } = maps(repo, commit, content),
      mapper = loadMaps(repo, pins)
    assert.equal(mapper.proofs.length, 6)
    const position = mapper.frame('weft-warp', {
      url: 'http://localhost/app.js',
      lineNumber: 0,
      columnNumber: 0,
    }).original
    assert.equal(position.line, null)
    assert.equal(position.column, null)
    const verified = { provenance, path: source }
    const authored = authoredPosition(verified, {
      originalLine: 0,
      originalColumn: provenance.prefixUtf16Columns + 7,
    })
    assert.equal(authored.line, 1)
    assert.equal(authored.column, 8)
    assert.equal(authoredPosition(verified, { originalLine: 1, originalColumn: 7 }).column, 8)
  }))

test('source tampering, wrong transform output and wrong captured plugin provenance fail', () =>
  fixture(({ repo, commit, content }) => {
    const prove = (text) => keyedProvenance(repo, commit, source, text, Buffer.from(original))
    assert.throws(() => prove('import "wrong-module";' + original), /transform provenance/)
    assert.throws(() => prove(content.replace('get(', 'set(')), /transform provenance/)
    writeFileSync(join(repo, source), original + '// tampered\n')
    assert.throws(() => prove(content), /Transform input differs from Git/)
    writeFileSync(join(repo, source), original)
    const bytes = readFileSync(join(repo, plugin))
    writeFileSync(join(repo, plugin), Buffer.concat([bytes, Buffer.from('\n// wrong producer\n')]))
    assert.throws(() => prove(content), /Transform module differs from Git/)
  }))

test('complete failed maps and metadata survive reconstructed output cleanup', () =>
  fixture(async ({ root, repo, commit, content }) => {
    const out = join(root, 'evidence'),
      log = evidence(out)
    let expected
    await assert.rejects(
      preservingAssets(
        repo,
        STACKS.map((name) => ({ name })),
        null,
        () => {
          expected = maps(repo, commit, content + '// wrong transform\n')
          return analyzeWithEvidence(repo, 'unused', expected.pins.assets, log, () =>
            loadMaps(repo, expected.pins),
          )
        },
      ),
      /Mapped source mismatch/,
    )
    const saved = JSON.parse(readFileSync(join(out, 'map-diagnostics.json')))
    assert.equal(saved.accepted, false)
    assert.equal(saved.records.length, 6)
    for (const row of saved.records) {
      const compressed = readFileSync(join(out, row.file)),
        raw = gunzipSync(compressed)
      assert.deepEqual(raw, expected.raw[row.stack])
      assert.equal(digest(raw), row.sha256)
      assert.equal(digest(compressed), row.gzipSha256)
      assert.equal(row.metadata.sources[0].sha256, digest(JSON.parse(raw).sourcesContent[0]))
      assert.equal(existsSync(join(repo, 'benchmarks/compare', row.stack, 'dist')), false)
    }
  }))

test('evidence preservation errors stay fatal alongside the original mapping failure', () =>
  fixture(({ root, repo, commit, content }) => {
    const { pins } = maps(repo, commit, content),
      path = join(repo, 'benchmarks/compare/weft-warp/dist/app.js.map')
    for (const kind of ['symlink', 'oversized']) {
      rmSync(path)
      if (kind === 'symlink') symlinkSync(join(repo, source), path)
      else {
        writeFileSync(path, '')
        truncateSync(path, 16 * 1024 ** 2)
      }
      assert.throws(
        () =>
          analyzeWithEvidence(repo, 'unused', pins.assets, evidence(join(root, kind)), () => {
            throw new Error('Original mismatch')
          }),
        (error) =>
          error instanceof AggregateError &&
          error.errors[0].message === 'Original mismatch' &&
          error.cause === error.errors[1],
      )
    }
  }))
