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
const coverage = path.join(root, 'src/coverage/blink.json')
const previous = fs.existsSync(coverage) ? fs.readFileSync(coverage) : null
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
  fs.mkdirSync(path.dirname(coverage), { recursive: true })
  fs.writeFileSync(coverage, JSON.stringify({ ran }))
  await specialize('blink')
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
  console.log('Coverage keeps split helpers in the base; boundary output matches.')
} finally {
  if (previous === null) fs.unlinkSync(coverage)
  else fs.writeFileSync(coverage, previous)
  await specialize('blink')
}
