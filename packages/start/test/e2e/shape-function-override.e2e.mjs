import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'vite'
import { resolveImportedOverride, shapeOverride } from '../../src/vite/shape-override.mjs'

async function project(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'kerf-override-functions-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const file = (name) => join(root, name)
  const write = (name, text) => writeFileSync(file(name), text)
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  })
  const ctx = {
    resolve: (...args) => server.environments.client.pluginContainer.resolveId(...args),
  }
  return { root, file, write, server, ctx }
}

void test('extracts closed local function declarations and expressions', async (t) => {
  const p = await project(t)
  try {
    for (const declaration of [
      'function Waiting() { return <div>local declaration</div> }',
      'export function Waiting() { return <div>local declaration</div> }',
      'export default function Waiting() { return <div>local declaration</div> }',
      'const Waiting = function () { return <div>local expression</div> }',
      'const Waiting = function Named() { return <div>local expression</div> }',
    ]) {
      p.write('page.tsx', `throw Error('setup'); ${declaration}; export const skeleton = Waiting`)
      const code = shapeOverride(p.file('page.tsx'))
      assert.match(code ?? '', /local (declaration|expression)/, declaration)
      assert.doesNotMatch(code, /setup|throw/)
    }
  } finally {
    await p.server.close()
  }
})

void test('extracts direct imported function declarations and expressions', async (t) => {
  const p = await project(t)
  try {
    for (const [binding, declaration] of [
      ['Waiting', 'export default function Waiting() { return <div>default</div> }'],
      ['Waiting', 'export default function () { return <div>default</div> }'],
      ['{ Waiting }', 'export function Waiting() { return <div>named</div> }'],
      ['{ Waiting }', 'export const Waiting = function () { return <div>named</div> }'],
      ['Waiting', 'export default (function () { return <div>default</div> })'],
    ]) {
      p.write('page.tsx', `import ${binding} from './waiting.tsx'; export const skeleton = Waiting`)
      p.write('waiting.tsx', `throw Error('setup'); ${declaration}`)
      const found = await resolveImportedOverride(p.ctx, p.file('page.tsx'), p.root)
      assert.match(found?.code ?? '', /(?:default|named)/, declaration)
      assert.doesNotMatch(found.code, /setup|throw/)
    }
  } finally {
    await p.server.close()
  }
})

void test('rejects unsafe bodies, parameters, and mutable or shadowed declarations', async (t) => {
  const p = await project(t)
  try {
    for (const declaration of [
      'function Waiting(x = danger()) { return <div /> }',
      'function Waiting() { danger(); return <div /> }',
      'function* Waiting() { return <div /> }',
      'async function Waiting() { return <div /> }',
      'function Waiting() { return <div>{secret}</div> }',
      'function Waiting() { return <div /> } Waiting = danger',
      'function Waiting() { return <div /> } eval("Waiting = danger")',
      'function Waiting() { return <div /> } function other(Waiting) { Waiting = danger }',
      'const Waiting = function (x = danger()) { return <div /> }',
      'const Waiting = async function () { return <div /> }',
      'const Waiting = function* () { return <div /> }',
    ]) {
      p.write('page.tsx', `${declaration}; export const skeleton = Waiting`)
      assert.equal(shapeOverride(p.file('page.tsx')), undefined, declaration)
    }
    p.write('page.tsx', "import Waiting from './waiting.tsx'; export const skeleton = Waiting")
    for (const declaration of [
      'export default function Waiting() { return <div /> } Waiting = danger',
      'export default function Waiting() { return <div /> } function other(Waiting) {}',
      'export default function (x = danger()) { return <div /> }',
      'export default async function () { return <div /> }',
      'export default function* () { return <div /> }',
    ]) {
      p.write('waiting.tsx', declaration)
      const found = await resolveImportedOverride(p.ctx, p.file('page.tsx'), p.root)
      assert.equal(found?.code, undefined, declaration)
    }
    p.write('page.tsx', "import { Waiting } from './waiting.tsx'; export const skeleton = Waiting")
    p.write('waiting.tsx', 'export function Waiting() { return <div /> } Waiting = danger')
    const result = await resolveImportedOverride(p.ctx, p.file('page.tsx'), p.root)
    assert.equal(result?.code, undefined)
  } finally {
    await p.server.close()
  }
})
