import { readFileSync } from 'node:fs'
import typescript from 'typescript'
import { describe, expect, it } from 'vitest'
import { configSchema, loadConfig as loadConfigRaw } from '../src/load-config.mjs'
import { bindSlots } from '../src/slots.mjs'
import { project } from './helpers.mjs'

type Diagnostic = { code: string; span?: [number, number]; why: string; severity: string }
type ConfigResult = Omit<Awaited<ReturnType<typeof loadConfigRaw>>, 'diagnostics'> & {
  diagnostics: Diagnostic[]
}
const loadConfig = loadConfigRaw as (dir: string) => Promise<ConfigResult>
type Schema = { shape?: Record<string, Schema>; unwrap?: () => Schema }
type Pairs = [string, string[], string[]][]

const withConfig = (body: string) =>
  project({ 'kerf.config.ts': `import { defineConfig } from '@kerf/core/config'\n${body}` })
const codes = (r: ConfigResult) => r.diagnostics.map((d) => [d.code, d.span![0]])

describe('kerf.config.ts', () => {
  it('is optional', async () => {
    const r = await loadConfig(project())
    expect(r).toMatchObject({ file: null, config: {}, diagnostics: [] })
  })

  it('loads TypeScript (including non-erasable syntax) through defineConfig from @kerf/core/config', async () => {
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
    expect(r.config.tasks!.seed!.env).toEqual(['dev'])
    expect(r.config.test!.lanes).toEqual(['fast'])
  })

  it('sees edits on the next load (for a long-lived kerf mcp)', async () => {
    const { writeFileSync } = await import('node:fs')
    const dir = withConfig('export default defineConfig({ environments: { dev: {} } })\n')
    expect(Object.keys((await loadConfig(dir)).config.environments!)).toEqual(['dev'])
    writeFileSync(
      `${dir}/kerf.config.ts`,
      "import { defineConfig } from '@kerf/core/config'\nexport default defineConfig({ environments: { ci: {} } })\n",
    )
    expect(Object.keys((await loadConfig(dir)).config.environments!)).toEqual(['ci'])
  })

  it('P007: unknown keys and wrong types, with the path', async () => {
    const r = await loadConfig(
      withConfig('export default defineConfig({ scop: {}, tasks: { a: { run: 1 } } } as any)\n'),
    )
    expect(r.diagnostics.map((d) => d.code)).toEqual(['P007', 'P007'])
    expect(r.diagnostics.map((d) => d.why).join('\n')).toMatch(/tasks\.a\.run/)
    expect(r.diagnostics.map((d) => d.why).join('\n')).toMatch(/scop/)
  })

  it('P007: a config that throws on load', async () => {
    const r = await loadConfig(withConfig("throw new Error('boom')\n"))
    expect(r.diagnostics).toMatchObject([{ code: 'P007', why: expect.stringContaining('boom') }])
  })

  registerTaskDiagnostics()

  it('reserved plugins/slots: validated as data, never executed', async () => {
    const r = await loadConfig(
      withConfig(`export default defineConfig({
  plugins: [
    { name: '@kerf/text', provides: ['text.measure', 'font.build'] },
    { name: 'pretext-measure', provides: ['text.measure'] },
    { name: 'pretext-measure' },
    { name: 'bus', provides: [{ slot: 'surface.renderer', key: 'keel-pixel' }] },
  ],
  slots: { 'text.measure': 'pretext-measure', 'font.bild': 'x', 'realtime.bus': 'ghost' },
})
`),
    )
    expect(r.diagnostics.map((d) => d.code)).toEqual(['P116', 'P008', 'P009'])
    expect(r.slots).toMatchObject({
      'text.measure': 'pretext-measure',
      'font.build': '@kerf/text',
      'realtime.bus': 'kerf:default:memory',
      'surface.renderer': { canvas2d: 'kerf:default', 'keel-pixel': 'bus', webgl2: 'kerf:default' },
    })
  })
})

describe('site (research 20 §2, §6)', () => {
  it('a complete site block passes', async () => {
    const r = await loadConfig(
      withConfig(`export default defineConfig({
  site: { name: 'Acme', url: 'https://acme.dev', title: '%s · Acme', description: 'Tools for builders.', locale: 'en_US', image: 'auto', twitter: { card: 'summary_large_image', site: '@acme' } },
})
`),
    )
    expect(r.diagnostics).toEqual([])
    expect(r.config.site!.url).toBe('https://acme.dev')
  })

  it("imports the app's own modules the way the app does: no extension, or a folder's index", async () => {
    const dir = project({
      'kerf.config.ts': `import { defineConfig } from '@kerf/core/config'\nimport { NAME } from './src/name'\nimport { LOCALE } from './src/i18n'\nexport default defineConfig({ site: { name: NAME, locale: LOCALE, description: 'x' } })\n`,
      'src/name.ts': "export const NAME: string = 'acme'\n",
      'src/i18n/index.ts': "export const LOCALE = 'en_US'\n",
    })
    const r = await loadConfig(dir)
    expect(r.diagnostics).toEqual([])
    expect(r.config.site).toEqual({ name: 'acme', locale: 'en_US', description: 'x' })
  })

  it('P007: a relative url, a template without %s, a bad locale, an unknown key', async () => {
    const r = await loadConfig(
      withConfig(
        "export default defineConfig({ site: { url: '/acme', title: 'Acme', locale: 'english', descripton: 'x' } } as any)\n",
      ),
    )
    expect(r.diagnostics.map((d) => d.code)).toEqual(['P007', 'P007', 'P007', 'P007'])
    expect(r.diagnostics.map((d) => d.why).join('\n')).toMatch(
      /site\.url[\s\S]*site\.title[\s\S]*site\.locale[\s\S]*descripton/,
    )
  })

  it('P007: `site.card` takes hex colours and a font family, nothing that could reach a style attribute', async () => {
    const bad = await loadConfig(
      withConfig(
        "export default defineConfig({ site: { card: { accent: 'red;background:url(x)' } } })\n",
      ),
    )
    expect(bad.diagnostics.map((d) => d.code)).toEqual(['P007'])
    const good = await loadConfig(
      withConfig(
        "export default defineConfig({ site: { name: 'Acme', description: 'Tools.', image: false, card: { scheme: 'light', accent: '#ff3300', light: { text: '#111111' } } } })\n",
      ),
    )
    expect(good.diagnostics).toEqual([])
  })

  it('H001: a relative image (or auto) with no site.url', async () => {
    for (const image of ["'/og.png'", "'auto'", "{ url: 'og.png', width: 1200, height: 630 }"]) {
      const r = await loadConfig(
        withConfig(
          `export default defineConfig({ site: { name: 'Acme', description: 'Tools.', image: ${image} } })\n`,
        ),
      )
      expect(codes(r)).toEqual([['H001', 2]])
      expect(r.diagnostics[0]!.severity).toBe('warning') // a server falls back to the request's origin
    }
    const abs = await loadConfig(
      withConfig(
        "export default defineConfig({ site: { name: 'Acme', description: 'Tools.', image: 'https://cdn.acme.dev/og.png' } })\n",
      ),
    )
    expect(abs.diagnostics).toEqual([])
  })

  registerSiteDescriptionWarnings()
})

describe('slot binding (research 13 §2.2)', () => {
  const run = (config: Parameters<typeof bindSlots>[0]) => {
    const out: { code: string; why: string }[] = []
    const slots = bindSlots(config, (code, why) => out.push({ code, why }))
    return { slots, out }
  }

  it('P100 for two providers of a one slot, never settled by array order', () => {
    const a = run({
      plugins: [
        { name: 'a', provides: ['text.measure'] },
        { name: 'b', provides: ['text.measure'] },
      ],
    })
    const b = run({
      plugins: [
        { name: 'b', provides: ['text.measure'] },
        { name: 'a', provides: ['text.measure'] },
      ],
    })
    expect(a.out).toEqual([{ code: 'P100', why: expect.stringContaining('a, b') }])
    expect(b).toEqual(a)
    expect(a.slots['text.measure']).toBeNull()
  })

  it('P100 for a duplicate key in a keyed slot; slots: {} names the winner', () => {
    const plugins = [
      { name: 'x', provides: [{ slot: 'pay.rail', key: 'stripe' }] },
      { name: 'y', provides: [{ slot: 'pay.rail', key: 'stripe' }] },
    ]
    expect(run({ plugins }).out.map((o) => o.code)).toEqual(['P100'])
    const picked = run({ plugins, slots: { 'pay.rail': { stripe: 'y' } } })
    expect(picked.out).toEqual([])
    expect(picked.slots['pay.rail']).toEqual({ stripe: 'y' })
  })

  it('accepts device.* and a plugin-owned slot domain', () => {
    const r = run({
      plugins: [
        { name: 'charts', provides: ['charts.renderer', { slot: 'device.camera', key: 'ios' }] },
      ],
    })
    expect(r.out).toEqual([])
    expect(r.slots['charts.renderer']).toBe('charts')
    expect(r.slots['device.camera']).toEqual({ ios: 'charts' })
  })
})

describe('JSON and YAML config (research 34 §2)', () => {
  const plugin =
    "import { definePlugin } from '@kerf/core/plugin'\nexport default definePlugin({ name: 'acme', options: o => o ?? {}, contribute: () => ({}) })\n"
  const files = {
    'node_modules/acme/package.json': JSON.stringify({
      name: 'acme',
      type: 'module',
      exports: { './plugin': './plugin.mjs' },
    }),
    'node_modules/acme/plugin.mjs': plugin,
  }
  const site = { name: 'Acme', title: '%s · Acme', description: 'Tools.' }

  it('reads the same config from TypeScript, JSON and YAML', async () => {
    const ts = await loadConfig(
      project({
        ...files,
        'kerf.config.ts': `import acme from 'acme/plugin'\nexport default { site: ${JSON.stringify(site)}, runtime: 'bun', plugins: [acme({ level: 1 })] }\n`,
      }),
    )
    const json = await loadConfig(
      project({
        ...files,
        'kerf.config.json': JSON.stringify({
          $schema: './.kerf/config.schema.json',
          site,
          runtime: 'bun',
          plugins: [['acme', { level: 1 }]],
        }),
      }),
    )
    const yaml = await loadConfig(
      project({
        ...files,
        'kerf.config.yaml':
          'site: { name: Acme, title: "%s · Acme", description: Tools. }\nruntime: bun\nplugins:\n  - [acme, { level: 1 }]\n',
      }),
    )
    for (const r of [ts, json, yaml]) expect(r.diagnostics).toEqual([])
    expect(json.config).toEqual(ts.config)
    expect(yaml.config).toEqual(ts.config)
  })

  it('reports a bad key at its path, and a syntax error or a missing plugin as P007', async () => {
    const bad = await loadConfig(
      project({ 'kerf.config.yaml': 'site:\n  title: no placeholder\n' }),
    )
    expect(bad.diagnostics.map((d) => [d.code, d.span?.[0]])).toEqual([['P007', 2]])
    expect(
      (await loadConfig(project({ 'kerf.config.json': '{ nope' }))).diagnostics.map((d) => d.code),
    ).toEqual(['P007'])
    expect(
      (await loadConfig(project({ 'kerf.config.yaml': 'plugins: [ghost]\n' }))).diagnostics[0]!.why,
    ).toContain("`ghost` isn't installed")
  })

  it('two config files is P010, not a silent pick', async () => {
    const r = await loadConfig(
      project({
        'kerf.config.ts': 'export default {}\n',
        'kerf.config.yaml': 'site: { name: Acme }\n',
      }),
    )
    expect(r.diagnostics.map((d) => d.code)).toEqual(['P010'])
    expect(r.diagnostics[0]!.why).toContain('`kerf.config.yaml`')
  })
})

// config.d.ts is what an editor offers and the schema is what `kerf check` accepts: a key in one and not the other is
// either a P007 on valid-looking config or an option nobody can find. Every object they both describe has the same keys.
describe('config.d.ts and the schema', () => {
  const file = new URL('../../core/src/config.d.ts', import.meta.url)
  const sf = typescript.createSourceFile(
    'config.d.ts',
    readFileSync(file, 'utf8'),
    typescript.ScriptTarget.Latest,
    true,
  )
  const named = new Map(
    sf.statements
      .filter((s) => typescript.isInterfaceDeclaration(s) || typescript.isTypeAliasDeclaration(s))
      .map((s) => [s.name.text, s]),
  )
  /** The member names of an object type, following a reference to an interface in the file. */
  const members = (t: typescript.Node | undefined) => {
    if (t && typescript.isTypeReferenceNode(t)) t = named.get(t.typeName.getText(sf))
    if (t && typescript.isTypeAliasDeclaration(t)) t = t.type
    const list =
      t && (typescript.isInterfaceDeclaration(t) || typescript.isTypeLiteralNode(t))
        ? t.members
        : undefined
    return (
      list &&
      new Map(
        list
          .filter((m) => typescript.isPropertySignature(m))
          .map((m) => [m.name.getText(sf), m.type]),
      )
    )
  }
  const shape = (s: Schema | undefined) => {
    while (s && !s.shape && s.unwrap) s = s.unwrap()
    return s?.shape
  }
  /** Every object both sides describe, compared key for key, `path` deep. */
  const compare = (
    type: typescript.Node | undefined,
    schema: Schema | undefined,
    path: string,
    out: Pairs,
  ): Pairs => {
    const keys = members(type),
      fields = shape(schema)
    if (!keys || !fields) return out
    out.push([path, [...keys.keys()].toSorted(), Object.keys(fields).toSorted()])
    for (const [k, t] of keys) if (fields[k]) compare(t, fields[k], `${path}.${k}`, out)
    return out
  }

  it('name the same keys, at every level', () => {
    const pairs = compare(named.get('KerfConfig'), configSchema, 'config', [])
    expect(pairs.length).toBeGreaterThan(5)
    for (const [path, types, schema] of pairs)
      expect({ path, keys: types }).toEqual({ path, keys: schema })
  })
})

function registerTaskDiagnostics() {
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
    expect(codes(r)).toEqual([
      ['P003', 6],
      ['P003', 7],
      ['P004', 8],
      ['P007', 9],
    ])
  })
}

function registerSiteDescriptionWarnings() {
  it('H003: no description; H004: long title, template or description (warnings)', async () => {
    const long = 'x'.repeat(61)
    const r = await loadConfig(
      withConfig(`export default defineConfig({
  site: {
    name: '${long}',
    url: 'https://acme.dev',
    title: '%s | ${'y'.repeat(41)}',
  },
})
`),
    )
    expect(codes(r)).toEqual([
      ['H003', 3],
      ['H004', 4],
      ['H004', 6],
    ])
    expect(r.diagnostics.every((d) => d.severity === 'warning')).toBe(true)
    const d = await loadConfig(
      withConfig(
        `export default defineConfig({ site: { url: 'https://acme.dev', description: '${'z'.repeat(161)}' } })\n`,
      ),
    )
    expect(d.diagnostics).toMatchObject([
      { code: 'H004', why: expect.stringContaining('161 characters') },
    ])
  })
}
