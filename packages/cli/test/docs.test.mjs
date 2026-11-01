import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { agentsMd, limit, writeAgentsMd } from '../src/agents-md.mjs'
import { catalog, probe } from '../src/catalog.mjs'
import { docs, topics } from '../src/docs.mjs'
import { loadCompiler, resolveWeft } from '../src/weft.mjs'
import { fixture, project } from './helpers.mjs'

const status = probe(loadCompiler(resolveWeft(fixture)))

describe('catalog probe', () => {
  it('finds the codes the Phase 1 compiler reports, with their autofixes', () => {
    const reported = Object.entries(status).filter(([, s]) => s.implemented).map(([c]) => c)
    expect(reported).toEqual(['W000', 'W001', 'W005', 'W006', 'W010', 'W013', 'W014', 'W015', 'W017', 'W018', 'W019', 'W050', 'W051', 'W052', 'W054', 'W056', 'W060', 'W061', 'D024', 'D025'])
    expect(status.W006.autofix).toBe(true)
    expect(status.W015.autofix).toBe(true)
    expect(status.W001).toMatchObject({ autofix: false, suggestion: true })
    expect(status.W050).toMatchObject({ autofix: false, suggestion: true }) // → on(…) / interval(…)
    expect(status.W054).toMatchObject({ autofix: false, suggestion: true }) // → { ssr: false }
    expect(status.W051).toMatchObject({ autofix: false, suggestion: false })
  })

  it('has one entry per code, and every P100–P120 code is reserved', () => {
    const codes = catalog.map(e => e.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (let n = 100; n <= 120; n++) expect(codes).toContain(`P${n}`)
  })
})

describe('docs', () => {
  it('serves every topic', async () => {
    for (const topic of Object.keys(topics)) {
      const page = await docs(fixture, topic)
      expect(page.text.length, topic).toBeGreaterThan(100)
    }
  })

  it('explains the full-stack codes, and `start` carries them', async () => {
    for (const code of ['Q011', 'Q012', 'Q013', 'Q014', 'Q015', 'Q016', 'A001', 'A002', 'A003', 'A004', 'C001', 'C002']) expect((await docs(fixture, code)).text, code).toMatch(new RegExp(`^# ${code} \\((error|warning)\\)`))
    const page = (await docs(fixture, 'start')).text
    for (const word of ['weft db generate', 'contract.json', "auth: 'user'"]) expect(page).toContain(word)
  })

  it('`fonts` covers the plugin and says nothing needs importing', async () => {
    const page = (await docs(fixture, 'fonts')).text
    for (const word of ['text({', 'weft add text', 'There is nothing to import', '"Inter Fallback"', 'X021']) expect(page).toContain(word)
  })

  it('explains a code with its status in the installed weft', async () => {
    expect((await docs(fixture, 'w014')).text).toMatch(/^# W014 \(error\)[\s\S]*Status in weft@0\.0\.0:\*\* reported\./)
    expect((await docs(fixture, 'W011')).text).toContain('not reported by this weft yet')
    expect((await docs(fixture, 'P004')).text).toContain('reported by weft check')
    expect((await docs(fixture, 'W054')).text).toMatch(/Status in weft@0\.0\.0:\*\* reported, suggested edit\./)
    expect((await docs(fixture, 'diagnostics')).text).toMatch(/^\| T012 \| error \| .* \| reported by weft\/test after each test \|$/m)
  })

  it('rejects unknown topics with the list', async () => {
    await expect(docs(fixture, 'hooks')).rejects.toMatchObject({ code: 'E_UNKNOWN_TOPIC', message: expect.stringContaining('rules') })
  })
})

describe('AGENTS.md', () => {
  it('is generated from the installed weft and stays under 8 KB', async () => {
    const { text, bytes, overLimit } = await agentsMd(fixture)
    expect(bytes).toBeLessThan(limit)
    expect(overLimit).toBe(false)
    expect(text).toContain('weft@0.0.0')
    // `weft check` prints what a catalog here would: the rules cite the main codes, the rest are one line
    expect(text).not.toMatch(/^\| [A-Z]\d{3} \|/m)
    expect(text).toContain('`weft docs <code>` explains one')
    expect(text).not.toContain('Not reported yet')
    expect(text).not.toContain('Planned, not shipped yet')
    expect(text).toMatch(/^## Styling\n\n\*\*Run `weft style find <what it is>` first\*\*.*group\('card'.*D001–D007, D011, D020–D025, D030–D040, W060: `weft docs style`, `weft docs design`; `weft fix` applies the safe fixes\.$/m)
    expect(text).not.toContain('| `weft style` |') // the section covers it
    expect(text).toContain('Test checks (`weft check` on test files): T001–T009, T013.')
    // The installed weft has every planned export now, so the async rule is in and nothing is listed as missing.
    expect(text).toContain('**Async data is `resource(signal => fetch(…))`**')
    expect(text).not.toContain('Not in this version yet')
    expect(text).not.toContain('`setAttribute`')
    expect(text).toContain('| `weft check --json` |')
    expect(text).not.toContain('| `weft mcp` |') // `weft tasks --json` has it
    expect(text).toContain('- `weft/browser`: `online`, `visible`, `lifecycle`, `media`, `on`, `interval`. Create them in setup (W051)')
    expect(text).toMatch(/^- `weft\/test`: .*`net`.*`page`/m)
  })

  it('lists resource, Boundary, hydrate and weft/ssr when the installed weft exports them', async () => {
    const compiler = JSON.stringify(resolveWeft(fixture).compilerPath)
    const dir = project({
      'node_modules/weft/package.json': JSON.stringify({ name: 'weft', version: '0.1.0', exports: { '.': './index.ts', './dom': './dom.ts', './ssr': './ssr.ts', './test': './test.ts', './compiler': './compiler.cjs' } }),
      'node_modules/weft/compiler.cjs': `module.exports = require(${compiler})\n`,
      'node_modules/weft/index.ts': "export function state() {}\nexport function derived() {}\nexport { Boundary, resource, type Resource } from './async'\nexport { defineState } from './scope'\n",
      'node_modules/weft/dom.ts': 'export function render() {}\nexport function hydrate() {}\nexport function insert() {}\n',
      'node_modules/weft/ssr.ts': "export function renderToString() {}\nexport async function renderToStringAsync() {}\nexport function ssrHydrationKey() {}\nexport { createComponent } from './dom'\n",
      'node_modules/weft/test.ts': 'export function render() {}\n',
    })
    const { text, bytes } = await agentsMd(dir)
    expect(bytes).toBeLessThan(limit)
    expect(text).toContain('weft@0.1.0')
    expect(text).toMatch(/^- `weft`: `Boundary`, `defineState`, `derived`, `resource`, `state`, `state\.linked`$/m)
    expect(text).toContain('- `weft/dom`: `render`, `hydrate`.')
    expect(text).toContain('- `weft/ssr`: `renderToString`, `renderToStringAsync`.')
    expect(text).not.toContain('ssrHydrationKey')
    expect(text).toContain('10. **Async data is `resource(')
    expect(text).not.toContain('Not in this version yet: `resource`')
  })

  it('lists project tasks in Commands, so docs cannot drift from weft tasks', async () => {
    const dir = project({ 'weft.config.ts': "export default { tasks: { seed: { run: 'node seed.mjs', description: 'Load demo products', sideEffects: ['db'] } } }\n" })
    expect((await agentsMd(dir)).text).toContain('| `weft run seed` | Load demo products | db |')
  })

  it('a full-stack app gets the Full stack section, still under the limit', async () => {
    const dir = project({ 'src/routes/index.tsx': 'export default () => <h1>Hi</h1>\n' })
    const { text, bytes } = await agentsMd(dir)
    expect(text).toContain('## Full stack')
    expect(text).not.toContain('Import your own code')
    const aliased = await agentsMd(project({ 'src/routes/index.tsx': 'export default () => <h1>Hi</h1>\n', 'tsconfig.json': '{ "compilerOptions": { "paths": { "~/*": ["./src/*"] } } }' }))
    expect(aliased.text).toContain('`~/server/todos`')
    expect(aliased.text).not.toContain('#/')
    expect(text).toMatch(/`start`, .*`surface`, /)
    expect(bytes).toBeLessThan(limit)
    expect((await agentsMd(project())).text).not.toContain('## Full stack')
  })

  it('writes the file, then --check reports current until something changes', async () => {
    const dir = project()
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(false)
    expect(await writeAgentsMd(dir)).toMatchObject({ written: true })
    expect(await writeAgentsMd(dir, { check: true })).toMatchObject({ current: true, written: false })
    writeFileSync(join(dir, 'AGENTS.md'), `${readFileSync(join(dir, 'AGENTS.md'), 'utf8')}\nhand edit\n`)
    expect(await writeAgentsMd(dir, { check: true })).toMatchObject({ current: false, written: false })
  })
})

describe('a plugin in the docs', () => {
  const app = () => {
    const dir = project({ 'kit.mjs': "import { definePlugin } from 'weft/plugin'\nexport default definePlugin({ name: 'kit', namespace: 'KIT', contribute: () => ({ docs: { topic: 'kit', summary: 'The kit', file: new URL('./kit.md', import.meta.url).pathname }, diagnostics: [{ code: 'KIT001', severity: 'warning', catches: 'A loose kit', fix: 'Tighten it' }] }) })\n", 'kit.md': '# Kit\n\nHello.\n', 'weft.config.ts': "import kit from './kit.mjs'\nexport default { plugins: [kit()] }\n" })
    return dir
  }
  it('its topic is listed and served, and its codes have pages', async () => {
    const dir = app()
    expect((await docs(dir)).topics.kit).toBe('The kit')
    expect((await docs(dir, 'kit')).text).toContain('Hello.')
    const page = await docs(dir, 'KIT001')
    expect(page.text).toContain('A loose kit')
    expect(page.text).toContain('Tighten it')
    expect((await docs(dir, 'diagnostics')).text).toContain('KIT001')
  })
})

describe('page metadata reaches every agent surface', () => {
  const app = join(import.meta.dirname, '../../start/test/fixtures/app')
  it('AGENTS.md says every page sets `meta`, and stays under its limit', async () => {
    const { text, overLimit } = await agentsMd(app)
    expect(text).toMatch(/Every page sets `meta` as you build it/)
    expect(overLimit).toBe(false)
  })
  it('`weft docs meta` is a topic, and every H-code is real', async () => {
    expect((await docs(fixture, 'meta')).text).toMatch(/Set `meta` as you build the page/)
    expect(topics.meta).toContain('H011')
    expect(catalog.filter(e => /^H0/.test(e.code) && e.proposed)).toEqual([])
    expect((await docs(fixture, 'H001')).text).toContain('reported by weft check')
  })
})
