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
    expect(reported).toEqual(['W000', 'W001', 'W005', 'W006', 'W010', 'W013', 'W014', 'W015'])
    expect(status.W006.autofix).toBe(true)
    expect(status.W015.autofix).toBe(true)
    expect(status.W001).toMatchObject({ autofix: false, suggestion: true })
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

  it('explains a code with its status in the installed weft', async () => {
    expect((await docs(fixture, 'w014')).text).toMatch(/^# W014 \(error\)[\s\S]*Status in weft@0\.0\.0:\*\* reported\./)
    expect((await docs(fixture, 'W011')).text).toContain('not reported by this weft yet')
    expect((await docs(fixture, 'P004')).text).toContain('reported by weft check')
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
    for (const [code, s] of Object.entries(status)) {
      if (code === 'W000') continue
      if (s.implemented) expect(text).toMatch(new RegExp(`^\\| ${code} \\|`, 'm'))
      else expect(text).not.toMatch(new RegExp(`^\\| ${code} \\|`, 'm'))
    }
    // The installed weft has every planned export now, so the async rule is in and nothing is listed as missing.
    expect(text).toContain('**Async data is `resource(signal => fetch(…))`**')
    expect(text).not.toContain('Not in this version yet')
    expect(text).not.toContain('`setAttribute`')
    expect(text).toContain('| `weft check --json` |')
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
    expect((await agentsMd(dir)).text).toContain('| `node seed.mjs` | Load demo products | db |')
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
