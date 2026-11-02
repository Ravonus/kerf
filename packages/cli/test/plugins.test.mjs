import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { agentsMd } from '../src/agents-md.mjs'
import { check } from '../src/check.mjs'
import { main } from '../src/cli.mjs'
import { loadConfig } from '../src/load-config.mjs'
import { explain, list } from '../src/plugins.mjs'
import { project } from './helpers.mjs'

/** Two fixture plugins defined with @weft-js/core/plugin, in a config that lists them in `order`. */
const config = ({ order = ['fonts', 'kit'], kit = '', fonts = '', extra = '' } = {}) => `import { defineConfig } from '@weft-js/core/config'
import { definePlugin, defineSlot, provide } from '@weft-js/core/plugin'

const fontBuild = defineSlot({ id: 'font.build', version: 1, cardinality: 'one', sides: ['build'] })
const surface = defineSlot({ id: 'surface.renderer', version: 1, cardinality: 'keyed', sides: ['client'] })

const fonts = definePlugin({
  name: '@acme/plugin-fonts',
  version: '1.2.0',
  permissions: { fs: { read: ['fonts/**'] } },
  options: (o: { subset?: boolean }) => {
    if (o.subset !== undefined && typeof o.subset !== 'boolean') throw Object.assign(new Error('expected a boolean'), { path: 'subset' })
    return { subset: o.subset ?? true }
  },
  contribute: (o) => ({
    provides: [
      provide(fontBuild, { sides: { build: { module: '@acme/plugin-fonts/build', export: 'build', options: { subset: o.subset } } } }),
      provide(surface, { key: 'pixel', sides: { client: { module: './src/pixel.ts', export: 'pixel' } } }),
    ],
    diagnostics: [{ code: 'fonts/F001', catches: 'A face without a fallback', fix: 'Add one' }],
    ${fonts}
  }),
})

const kit = definePlugin({
  name: '@acme/kit',
  version: '0.1.0',
  namespace: 'D',
  contribute: () => ({
    tokens: { namespace: 'kit', css: ':root { --kit-accent: red; }', values: { accent: 'red' } },
    agents: { title: 'kit', text: 'Import components from \`@acme/kit\`.' },
    catalog: [{ name: 'Button', import: '@acme/kit', summary: 'A button' }],
    diagnostics: [{ code: 'D010', catches: 'Seed text fails contrast', fix: 'Pick another seed' }],
    ${kit}
  }),
})

const all = { fonts: fonts(), kit: kit() }
${extra}
export default defineConfig({ plugins: [${order.map(n => `all.${n}`).join(', ')}] })
`

const codes = r => r.diagnostics.map(d => d.code)

describe('@weft-js/core/plugin + weft plugins', () => {
  it('lists plugins sorted by name, with the slots they provide and bind', async () => {
    const dir = project({ 'weft.config.ts': config() })
    const r = await list(dir)
    expect(r.diagnostics).toEqual([])
    expect(r.plugins.map(p => p.name)).toEqual(['@acme/kit', '@acme/plugin-fonts'])
    expect(r.plugins[1]).toMatchObject({
      version: '1.2.0',
      provides: [{ slot: 'font.build', interface: [1], bound: true }, { slot: 'surface.renderer', key: 'pixel', interface: [1], bound: true }],
      permissions: { fs: { read: ['fonts/**'] } },
      namespace: 'fonts/',
      diagnostics: ['fonts/F001'],
    })
    expect(r.plugins[0]).toMatchObject({ tokens: 'kit', catalog: ['Button'], diagnostics: ['D010'], agents: 'kit' })
    expect(r.slots['font.build']).toBe('@acme/plugin-fonts')
    expect(r.slots['surface.renderer']).toEqual({ canvas2d: 'weft:default', pixel: '@acme/plugin-fonts', webgl2: 'weft:default' })
  })

  it('explains a binding down to the generated file', async () => {
    const dir = project({ 'weft.config.ts': config() })
    const r = await explain(dir, 'font.build')
    expect(r).toMatchObject({
      slot: 'font.build',
      file: '.weft/slots/font.build.ts',
      import: 'weft:slot/font.build',
      binding: { config: 'weft.config.ts', plugin: '@acme/plugin-fonts', version: '1.2.0', sides: ['build'], module: { module: '@acme/plugin-fonts/build', export: 'build', options: { subset: true } } },
    })
    expect((await explain(dir, 'text.measure')).binding).toMatchObject({ provider: null })
  })

  it('generates slot modules, slots.d.ts and token CSS on check and sync, byte-identical for any plugin order', async () => {
    const a = project({ 'weft.config.ts': config() })
    const b = project({ 'weft.config.ts': config({ order: ['kit', 'fonts'] }) })
    await check(a)
    expect(await main(['plugins', 'sync', '--root', b], { stdout: { write() {} }, stderr: { write() {} } })).toBe(0)
    const files = ['font.build', 'text.measure', 'surface.renderer', 'realtime.bus'].map(id => `.weft/slots/${id}.ts`).concat('.weft/slots.d.ts', '.weft/tokens/kit.css')
    for (const f of files) expect(readFileSync(join(a, f), 'utf8')).toBe(readFileSync(join(b, f), 'utf8'))
    expect(JSON.stringify(await list(a))).toBe(JSON.stringify(await list(b)).replaceAll(b, a))

    const font = readFileSync(join(a, '.weft/slots/font.build.ts'), 'utf8')
    expect(font).toContain('Do not edit')
    expect(font).toContain(`export const load = () => import("@acme/plugin-fonts/build").then(m => m["build"]({"subset":true}))`)
    expect(readFileSync(join(a, '.weft/slots/text.measure.ts'), 'utf8')).toContain("{ code: 'P101' }")
    expect(readFileSync(join(a, '.weft/slots/realtime.bus.ts'), 'utf8')).toContain('export const provider = "weft:default:memory"')
    expect(readFileSync(join(a, '.weft/slots/surface.renderer.ts'), 'utf8')).toContain('"pixel": () => import("../../src/pixel.ts")')
    const dts = readFileSync(join(a, '.weft/slots.d.ts'), 'utf8')
    expect(dts).toContain("declare module 'weft:slot/font.build'")
    expect(dts).not.toContain('text.measure')
    expect(readFileSync(join(a, '.weft/tokens/kit.css'), 'utf8')).toContain('--kit-accent: red')
  })

  it('a contribute() that throws a coded error fails the build with that code, owned by the plugin', async () => {
    const dir = project({ 'weft.config.ts': config({ kit: `...(() => { throw Object.assign(new Error('accent text is 3.1:1 on surface, needs 4.5:1'), { code: 'D010' }) })(),` }) })
    const r = await check(dir)
    expect(r.ok).toBe(false)
    const d = r.diagnostics.find(x => x.code === 'D010')
    expect(d).toMatchObject({ severity: 'error', owner: '@acme/kit', file: 'weft.config.ts' })
    expect(d.why).toContain('3.1:1')
  })

  it('P115: invalid options, with the path', async () => {
    const dir = project({ 'weft.config.ts': config({ extra: 'fonts({ subset: 1 as any })' }) })
    const r = await loadConfig(dir)
    expect(codes(r)).toEqual(['P115'])
    expect(r.diagnostics[0].why).toContain('subset')
  })

  it('P112 (AGENTS section over 1 KB), P111 (code outside the namespace), P117 (impure contribute)', async () => {
    const dir = project({
      'weft.config.ts': config({
        kit: `agents: { title: 'kit', text: 'x'.repeat(1100) },`,
        fonts: `catalog: [{ name: 'Seed', import: '@acme/plugin-fonts', summary: String(Math.random()) }],`,
      }).replace("code: 'fonts/F001'", "code: 'F001'"),
    })
    expect(codes(await loadConfig(dir)).sort()).toEqual(['P111', 'P112', 'P117'])
  })

  it('P113: token namespace and catalog collisions', async () => {
    const dir = project({
      'weft.config.ts': config({ fonts: `tokens: { namespace: 'kit' }, catalog: [{ name: 'Button', import: 'x', summary: 'y' }],` }),
    })
    expect(codes(await loadConfig(dir))).toEqual(['P113', 'P113'])
  })

  it('AGENTS.md gets a Plugins section in name order', async () => {
    const dir = project({ 'weft.config.ts': config() })
    const md = await agentsMd(dir)
    expect(md.text).toContain('## Plugins\n\n### kit\n\nImport components from `@acme/kit`.')
    expect(md.overLimit).toBe(false)
  })

  it('data-only entries still work, and nothing is generated without plugins', async () => {
    const dir = project({ 'weft.config.ts': "import { defineConfig } from '@weft-js/core/config'\nexport default defineConfig({ plugins: [{ name: 'x', provides: ['text.measure'] }] })\n" })
    const r = await list(dir)
    expect(r.plugins).toMatchObject([{ name: 'x', provides: [{ slot: 'text.measure', bound: true, interface: null }] }])
    const bare = project()
    await check(bare)
    expect(existsSync(join(bare, '.weft'))).toBe(false)
  })
})

describe('build-side slots and check hooks (research 26 §2.5, §3.1)', () => {
  it('sync writes .weft/slots/<id>.build.json for a bound build-side provider', async () => {
    const dir = project({ 'weft.config.ts': config() })
    await check(dir)
    expect(JSON.parse(readFileSync(join(dir, '.weft/slots/font.build.build.json'), 'utf8'))).toEqual({
      plugin: '@acme/plugin-fonts', version: '1.2.0', module: '@acme/plugin-fonts/build', export: 'build', options: { subset: true },
    })
    expect(existsSync(join(dir, '.weft/slots/surface.renderer.build.json'))).toBe(false) // client-only
    const after = project({ 'weft.config.ts': config({ order: ['kit'] }) })
    await check(after)
    expect(existsSync(join(after, '.weft/slots/font.build.build.json'))).toBe(false)
  })

  it("runs a plugin's check hook over its files: owner, span, fix; codes outside its namespace are P111", async () => {
    const kit = `check: {
      include: ['src/**/*.tsx'],
      run: (ctx) => ctx.files.flatMap(file => ctx.jsx(file).elements.filter(e => e.name === 'button' && !e.attr('type')).map(e => ({
        code: 'D011', file, start: e.start, end: e.tagEnd, why: 'A <button> without a type submits forms.',
        fix: { description: 'Add type', safe: true, edits: [{ start: e.tagEnd, end: e.tagEnd, text: ' type="button"' }] },
      }))).concat([{ code: 'X999', file: 'src/main.tsx', start: 0, end: 0, why: 'not mine' }]),
    },
    diagnostics: [{ code: 'D011', catches: 'Untyped button', fix: 'Add type="button"', severity: 'warning' }],`
    const dir = project({ 'weft.config.ts': config({ kit }) }) // its `diagnostics` comes after the fixture's, so it wins
    const r = await check(dir)
    const d011 = r.diagnostics.filter(d => d.code === 'D011')
    expect(d011.length).toBeGreaterThan(0)
    expect(d011[0]).toMatchObject({ owner: '@acme/kit', severity: 'warning', fix: { safe: true, description: 'Add type' } })
    const text = readFileSync(join(dir, d011[0].file), 'utf8')
    expect(text.slice(...d011[0].offset)).toBe('<button')
    expect(r.diagnostics.find(d => d.code === 'P111').why).toContain('`X999`, outside its namespace `D`')
  })
})
