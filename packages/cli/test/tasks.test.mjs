import { describe, expect, it } from 'vitest'
import { tasks } from '../src/tasks.mjs'
import { fixture, project } from './helpers.mjs'

describe('weft tasks', () => {
  it('lists the built-ins on the reference app, marking what is not shipped yet', async () => {
    const r = await tasks(fixture)
    expect(r).toMatchObject({ version: 1, ok: true, config: null, environments: [], diagnostics: [] })
    const available = r.tasks.filter(t => t.available).map(t => t.name)
    expect(available).toEqual(['check', 'tasks', 'docs', 'agents-md', 'mcp'])
    for (const t of r.tasks) {
      expect(t).toMatchObject({ kind: 'builtin', command: expect.stringMatching(/^weft /), description: expect.any(String), sideEffects: expect.any(Array) })
      expect(t.args.type).toBe('object')
    }
  })

  it('adds project tasks with args as JSON Schema (plain or Zod), side effects and environments', async () => {
    const dir = project({
      'weft.config.ts': `import { defineConfig } from 'weft/config'
import { z } from 'zod'
export default defineConfig({
  scope: { write: ['src/**'], forbid: ['.env*'] },
  environments: { dev: { url: 'http://localhost:5173' }, ci: {} },
  tasks: {
    seed: { run: 'node scripts/seed.mjs', description: 'Load demo products', sideEffects: ['db'], env: ['dev'], args: z.object({ count: z.number().int() }) },
    lint: { run: 'oxlint src', description: 'Lint', sideEffects: [], args: { type: 'object', properties: { fix: { type: 'boolean' } } } },
  },
})
`,
    })
    const r = await tasks(dir)
    expect(r.ok).toBe(true)
    expect(r.scope).toEqual({ write: ['src/**'], read: null, forbid: ['.env*'] })
    expect(r.environments).toEqual(['dev', 'ci'])
    const seed = r.tasks.find(t => t.name === 'seed')
    expect(seed).toMatchObject({ kind: 'project', command: 'node scripts/seed.mjs', sideEffects: ['db'], env: ['dev'], available: true })
    expect(seed.args).toMatchObject({ type: 'object', properties: { count: { type: 'integer' } }, required: ['count'] })
    expect(r.tasks.find(t => t.name === 'lint')).toMatchObject({ env: ['dev', 'ci'], args: { properties: { fix: { type: 'boolean' } } } })
  })

  it('carries P003/P004 so an agent sees broken tasks where it reads them', async () => {
    const dir = project({ 'weft.config.ts': "export default { tasks: { build: { run: 'vite build' } } }\n" })
    const r = await tasks(dir)
    expect(r.ok).toBe(false)
    expect(r.diagnostics.map(d => d.code)).toEqual(['P003', 'P004'])
    expect(r.tasks.find(t => t.kind === 'project')).toMatchObject({ name: 'build', description: null, sideEffects: null })
  })
})
