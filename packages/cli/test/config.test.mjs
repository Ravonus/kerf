import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/load-config.mjs'
import { bindSlots } from '../src/slots.mjs'
import { project } from './helpers.mjs'

const withConfig = body => project({ 'weft.config.ts': `import { defineConfig } from 'weft/config'\n${body}` })
const codes = r => r.diagnostics.map(d => [d.code, d.span[0]])

describe('weft.config.ts', () => {
  it('is optional', async () => {
    const r = await loadConfig(project())
    expect(r).toMatchObject({ file: null, config: {}, diagnostics: [] })
  })

  it('loads TypeScript (including non-erasable syntax) through defineConfig from weft/config', async () => {
    const dir = withConfig(`enum Env { Dev = 'dev' }
const lanes: Array<'fast'> = ['fast']
export default defineConfig({
  scope: { write: ['src/**'], forbid: ['.env*'] },
  environments: { [Env.Dev]: { url: 'http://localhost:5173' } },
  test: { lanes },
  tasks: { seed: { run: 'node seed.mjs', description: 'Load demo data', sideEffects: ['db'], env: [Env.Dev] } },
})
`)
    const r = await loadConfig(dir)
    expect(r.diagnostics).toEqual([])
    expect(r.config.tasks.seed.env).toEqual(['dev'])
    expect(r.config.test.lanes).toEqual(['fast'])
  })

  it('sees edits on the next load (for a long-lived weft mcp)', async () => {
    const { writeFileSync } = await import('node:fs')
    const dir = withConfig('export default defineConfig({ environments: { dev: {} } })\n')
    expect(Object.keys((await loadConfig(dir)).config.environments)).toEqual(['dev'])
    writeFileSync(`${dir}/weft.config.ts`, "import { defineConfig } from 'weft/config'\nexport default defineConfig({ environments: { ci: {} } })\n")
    expect(Object.keys((await loadConfig(dir)).config.environments)).toEqual(['ci'])
  })

  it('P007: unknown keys and wrong types, with the path', async () => {
    const r = await loadConfig(withConfig("export default defineConfig({ scop: {}, tasks: { a: { run: 1 } } } as any)\n"))
    expect(r.diagnostics.map(d => d.code)).toEqual(['P007', 'P007'])
    expect(r.diagnostics.map(d => d.why).join('\n')).toMatch(/tasks\.a\.run/)
    expect(r.diagnostics.map(d => d.why).join('\n')).toMatch(/scop/)
  })

  it('P007: a config that throws on load', async () => {
    const r = await loadConfig(withConfig("throw new Error('boom')\n"))
    expect(r.diagnostics).toMatchObject([{ code: 'P007', why: expect.stringContaining('boom') }])
  })

  it('P003 and P004 on tasks, located at the task', async () => {
    const r = await loadConfig(
      withConfig(`export default defineConfig({
  environments: { dev: {} },
  tasks: {
    seed: { run: 'node seed.mjs', description: 'Seed', sideEffects: ['db'] },
    check: { run: 'tsc', description: 'Types', sideEffects: [] },
    again: { run: 'node seed.mjs', description: 'Seed again', sideEffects: ['db'] },
    vague: { run: 'node vague.mjs' } as any,
    prod: { run: 'node deploy.mjs', description: 'Deploy', sideEffects: ['network'], env: ['prod'] },
  },
})
`),
    )
    expect(codes(r)).toEqual([['P003', 6], ['P003', 7], ['P004', 8], ['P007', 9]])
  })

  it('reserved plugins/slots: validated as data, never executed', async () => {
    const r = await loadConfig(
      withConfig(`export default defineConfig({
  plugins: [
    { name: '@weft/plugin-text', provides: ['text.measure', 'font.build'] },
    { name: 'pretext-measure', provides: ['text.measure'] },
    { name: 'pretext-measure' },
    { name: 'bus', provides: [{ slot: 'surface.renderer', key: 'keel-pixel' }] },
  ],
  slots: { 'text.measure': 'pretext-measure', 'font.bild': 'x', 'realtime.bus': 'ghost' },
})
`),
    )
    expect(r.diagnostics.map(d => d.code)).toEqual(['P116', 'P008', 'P009'])
    expect(r.slots).toMatchObject({
      'text.measure': 'pretext-measure',
      'font.build': '@weft/plugin-text',
      'realtime.bus': 'weft:default:memory',
      'surface.renderer': { canvas2d: 'weft:default', 'keel-pixel': 'bus', webgl2: 'weft:default' },
    })
  })
})

describe('slot binding (research 13 §2.2)', () => {
  const run = config => {
    const out = []
    const slots = bindSlots(config, (code, why) => out.push({ code, why }))
    return { slots, out }
  }

  it('P100 for two providers of a one slot, never settled by array order', () => {
    const a = run({ plugins: [{ name: 'a', provides: ['text.measure'] }, { name: 'b', provides: ['text.measure'] }] })
    const b = run({ plugins: [{ name: 'b', provides: ['text.measure'] }, { name: 'a', provides: ['text.measure'] }] })
    expect(a.out).toEqual([{ code: 'P100', why: expect.stringContaining('a, b') }])
    expect(b).toEqual(a)
    expect(a.slots['text.measure']).toBeNull()
  })

  it('P100 for a duplicate key in a keyed slot; slots: {} names the winner', () => {
    const plugins = [{ name: 'x', provides: [{ slot: 'pay.rail', key: 'stripe' }] }, { name: 'y', provides: [{ slot: 'pay.rail', key: 'stripe' }] }]
    expect(run({ plugins }).out.map(o => o.code)).toEqual(['P100'])
    const picked = run({ plugins, slots: { 'pay.rail': { stripe: 'y' } } })
    expect(picked.out).toEqual([])
    expect(picked.slots['pay.rail']).toEqual({ stripe: 'y' })
  })

  it('accepts device.* and a plugin-owned slot domain', () => {
    const r = run({ plugins: [{ name: 'charts', provides: ['charts.renderer', { slot: 'device.camera', key: 'ios' }] }] })
    expect(r.out).toEqual([])
    expect(r.slots['charts.renderer']).toBe('charts')
    expect(r.slots['device.camera']).toEqual({ ios: 'charts' })
  })
})
