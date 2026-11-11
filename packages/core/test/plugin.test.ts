// @kerf-js/core/plugin and the Vite side of slots: `kerf:slot/<id>` resolves to the generated module (research 13 §2.6).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import kerf from '../vite.mjs'
import { definePlugin, defineSlot, provide } from '@kerf-js/core/plugin'

type Built = { output: { code: string }[] }

test('definePlugin: plain data entry, frozen contributions, P115 on bad options', () => {
  const slot = defineSlot({ id: 'text.measure', version: 1, cardinality: 'one', sides: ['client'] })
  const text = definePlugin({
    name: '@kerf-js/text',
    version: '0.1.0',
    options: (o: { engine?: string }) => {
      if (o.engine && o.engine !== 'slim')
        throw Object.assign(new Error('unknown engine'), { path: 'engine' })
      return { engine: o.engine ?? 'slim' }
    },
    contribute: (o: { engine: string }) => ({
      provides: [provide(slot, { sides: { client: { module: 'x', export: 'y', options: o } } })],
    }),
  })
  const p = text()
  expect(JSON.parse(JSON.stringify(p))).toEqual({
    name: '@kerf-js/text',
    version: '0.1.0',
    provides: ['text.measure'],
    options: { engine: 'slim' },
  })
  expect(p.namespace).toBe('text/')
  const m = p.contribute({ command: 'build', mode: 'production', root: '/' })
  expect(Object.isFrozen(m.provides![0]!.sides)).toBe(true)
  expect(() => text({ engine: 'fast' })).toThrow(
    expect.objectContaining({ code: 'P115', path: 'engine' }),
  )
})

test('kerf:slot/<id> resolves to .kerf/slots/<id>.ts, and a missing one is P101', async () => {
  const root = mkdtempSync(join(tmpdir(), 'kerf-slot-'))
  try {
    mkdirSync(join(root, '.kerf/slots'), { recursive: true })
    writeFileSync(join(root, '.kerf/slots/a.b.ts'), 'export const load = () => 42\n')
    writeFileSync(
      join(root, 'main.js'),
      "import { load } from 'kerf:slot/a.b'\nconsole.log(load())\n",
    )
    const run = () =>
      build({
        root,
        logLevel: 'silent',
        plugins: [kerf()],
        build: { write: false, lib: { entry: join(root, 'main.js'), formats: ['es'] } },
      })
    const out = (await run()) as unknown as Built[]
    expect(out[0]!.output[0]!.code).toContain('42')
    writeFileSync(join(root, 'main.js'), "import { load } from 'kerf:slot/c.d'\nload()\n")
    await expect(run()).rejects.toThrow(/P101 kerf:slot\/c\.d/)
    // A slot @kerf-js/core/surface imports builds without `kerf plugins sync`, and fails only if it's used (research 33 §5).
    writeFileSync(
      join(root, 'main.js'),
      "import { load } from 'kerf:slot/text.measure'\nconsole.log(load())\n",
    )
    await expect(run()).resolves.toBeTruthy()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('kerf:keyed reads the code it is given: bracket forms bring it in, a quoted word alone does not', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kerf-keyed-'))
  const size = async (body: string) => {
    writeFileSync(
      join(dir, 'entry.ts'),
      `import { state } from '@kerf-js/core'\nconst box = state({ a: 1 })\n${body}\n`,
    )
    const out = await build({
      configFile: false,
      logLevel: 'silent',
      root: dir,
      plugins: [kerf()],
      build: {
        write: false,
        lib: { entry: join(dir, 'entry.ts'), formats: ['es'], fileName: 'entry' },
      },
    })
    return (out as unknown as Built[])[0]!.output[0]!.code
  }
  try {
    const without = await size(`document.title = String(box.value.a) + 'set'`)
    const bracket = await size(`document.title = String(box['get']('a'))`)
    const dotted = await size(`document.title = String(box.get('a'))`)
    expect(bracket.length).toBeGreaterThan(without.length + 100)
    expect(Math.abs(bracket.length - dotted.length)).toBeLessThan(40)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}, 60000)
