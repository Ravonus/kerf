// weft/plugin and the Vite side of slots: `weft:slot/<id>` resolves to the generated module (research 13 §2.6).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import weft from '../vite.mjs'
import { definePlugin, defineSlot, provide } from '../src/plugin.mjs'

test('definePlugin: plain data entry, frozen contributions, P115 on bad options', () => {
  const slot = defineSlot({ id: 'text.measure', version: 1, cardinality: 'one', sides: ['client'] })
  const text = definePlugin({
    name: '@weft/plugin-text',
    version: '0.1.0',
    options: (o: { engine?: string }) => {
      if (o.engine && o.engine !== 'slim') throw Object.assign(new Error('unknown engine'), { path: 'engine' })
      return { engine: o.engine ?? 'slim' }
    },
    contribute: o => ({ provides: [provide(slot, { sides: { client: { module: 'x', export: 'y', options: o } } })] }),
  })
  const p = text()
  expect(JSON.parse(JSON.stringify(p))).toEqual({ name: '@weft/plugin-text', version: '0.1.0', provides: ['text.measure'], options: { engine: 'slim' } })
  expect(p.namespace).toBe('text/')
  const m = p.contribute({ command: 'build', mode: 'production', root: '/' })
  expect(Object.isFrozen(m.provides![0].sides)).toBe(true)
  expect(() => text({ engine: 'fast' })).toThrow(expect.objectContaining({ code: 'P115', path: 'engine' }))
})

test('weft:slot/<id> resolves to .weft/slots/<id>.ts, and a missing one is P101', async () => {
  const root = mkdtempSync(join(tmpdir(), 'weft-slot-'))
  try {
    mkdirSync(join(root, '.weft/slots'), { recursive: true })
    writeFileSync(join(root, '.weft/slots/a.b.ts'), 'export const load = () => 42\n')
    writeFileSync(join(root, 'main.js'), "import { load } from 'weft:slot/a.b'\nconsole.log(load())\n")
    const run = () => build({ root, logLevel: 'silent', plugins: [weft()], build: { write: false, lib: { entry: join(root, 'main.js'), formats: ['es'] } } })
    const out = (await run()) as any
    expect(out[0].output[0].code).toContain('42')
    writeFileSync(join(root, 'main.js'), "import { load } from 'weft:slot/c.d'\nload()\n")
    await expect(run()).rejects.toThrow(/P101 weft:slot\/c\.d/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
