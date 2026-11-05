// Verify coverage never moves a helper introduced by a source split into a lazy pack.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import * as esbuild from 'esbuild'
import { specialize } from '../specialize.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const upstream = path.join(root, 'node_modules/@chenglou/pretext/src')
const vendor = path.join(root, 'vendor/pretext/src')
const engines = ['blink', 'webkit', 'gecko']
const coverageDirectory = path.join(root, 'src/coverage')
const coverageFiles = engines.map((engine) => path.join(coverageDirectory, `${engine}.json`))
const hadCoverageDirectory = fs.existsSync(coverageDirectory)
const previous = coverageFiles.map((file) => (fs.existsSync(file) ? fs.readFileSync(file) : null))
const modules = fs.readdirSync(vendor).filter((f) => f.endsWith('.ts') && f !== 'rich-inline.ts')
const ran = fs
  .readdirSync(upstream)
  .filter((f) => f.endsWith('.ts'))
  .flatMap((f) =>
    ts
      .createSourceFile(
        f,
        fs.readFileSync(path.join(upstream, f), 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      )
      .statements.filter((s) => ts.isFunctionDeclaration(s) && s.name)
      .map((s) => s.name.text),
  )
try {
  fs.mkdirSync(coverageDirectory, { recursive: true })
  for (const file of coverageFiles) fs.writeFileSync(file, JSON.stringify({ ran }))
  for (const engine of engines) {
    await specialize(engine)
    const out = path.join(root, 'gen', engine)
    assert.deepEqual(
      modules.filter((file) => !fs.existsSync(path.join(out, file))),
      [],
    )
    const rare = fs.readdirSync(out).filter((file) => file.endsWith('.rare.ts'))
    assert.deepEqual(rare, [], `${engine}: split helpers moved to the rare pack`)
  }
  const source = fs.readFileSync(path.join(root, 'gen/blink/line-breaks.ts'), 'utf8')
  const isStub = (text) =>
    /function ruleBoundary\([^]*?__missing\('rare', 'ruleBoundary'\)/.test(text)
  assert.equal(isStub(source), false)
  assert.equal(isStub("function ruleBoundary() { return __missing('rare', 'ruleBoundary') }"), true)
  const result = await esbuild.build({
    entryPoints: [path.join(root, 'gen/blink/line-breaks.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  })
  const mod = await import(
    'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')
  )
  const flags = new Uint8Array(4)
  mod.markRuleBoundaries(mod.getBreakRules('chromium/line_normal'), 'a b', flags)
  assert.deepEqual([...flags], [0, 0, 1, 1])
  console.log(
    `Coverage keeps split helpers in the base: ${modules.length} modules, ${ran.length} names, ${engines.length} engines; boundary output matches.`,
  )
} finally {
  coverageFiles.forEach((file, i) => {
    if (previous[i] === null) {
      if (fs.existsSync(file)) fs.unlinkSync(file)
    } else fs.writeFileSync(file, previous[i])
  })
  if (!hadCoverageDirectory) fs.rmdirSync(coverageDirectory)
  for (const engine of engines) await specialize(engine)
}
