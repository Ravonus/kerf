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
    expect(text).toContain('Not in this version yet: `resource`, `defineState`')
    expect(text).not.toContain('`setAttribute`')
    expect(text).toContain('| `weft check --json` |')
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
