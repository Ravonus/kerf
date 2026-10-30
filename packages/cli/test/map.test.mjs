// `weft map` (research 34 §8): what to call in this app, with a row only for what it has.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { check } from '../src/check.mjs'
import { agentMap, formatMap, writeMap } from '../src/map.mjs'
import { project } from './helpers.mjs'

const want = (map, text) => map.rows.find(r => r.want === text)
const full = {
  'weft.config.ts': "export default { site: { name: 'Acme' }, runtime: 'bun', tasks: { seed: { run: 'node s.mjs', description: 'Seed', sideEffects: ['db'] } } }\n",
  'src/routes/index.tsx': 'export default () => <h1>Hi</h1>\n',
  'src/routes/_layout.tsx': 'export default p => p.children\n',
  'src/routes/todos/[id].tsx': 'export default () => <h1>Hi</h1>\n',
  'src/server/todos.ts': "export const listTodos = query({ run: () => [] })\nexport const addTodo = mutation({ run: () => {} })\nexport const room = channel({})\n",
  'src/db/index.server.ts': "import { createDb } from '@weft/start/db/postgres'\n",
  'src/db/schema.ts': "export const todos = pgTable('todos', {})\nexport const users = pgTable('users', {})\n",
  'src/auth.server.ts': 'export default {}\n',
  'src/env.server.ts': 'export default {}\n',
}

describe('weft map', () => {
  it('lists what the app has, and what to call for it', async () => {
    const map = await agentMap(project(full))
    expect(map).toMatchObject({ app: 'Acme', stack: { runtime: 'bun', db: { engine: 'postgres', layer: 'drizzle' }, auth: 'better-auth' } })
    expect(want(map, 'Pages, their data and metadata')).toMatchObject({ call: '`weft routes --meta`', have: 'index, todos/[id]' })
    expect(want(map, 'Server functions').have).toBe('`src/server/todos.ts`: listTodos, addTodo')
    expect(want(map, 'Channels').have).toBe('room')
    expect(want(map, 'Tables and migrations').have).toBe('todos, users')
    expect(want(map, 'Project tasks').have).toBe('seed')
    expect(want(map, 'Environment variables').call).toContain('`src/env.server.ts`')
    expect(formatMap(map)).toContain('Stack: runtime bun, drizzle on postgres, better-auth.')
  })

  it('has no row for a system the app does not have', async () => {
    const map = await agentMap(project({ 'src/App.tsx': 'export default () => <h1>Hi</h1>\n' }))
    for (const row of ['Tables and migrations', 'Who the user is', 'Channels', 'Project tasks']) expect(want(map, row)).toBeUndefined()
    expect(want(map, 'A rule or a diagnostic')).toBeDefined()
  })

  it('a plugin adds its own rows', async () => {
    const plugin = "import { definePlugin } from 'weft/plugin'\nexport default definePlugin({ name: 'acme', options: o => o ?? {}, contribute: () => ({ map: [{ want: 'Audit log', call: '`acme audit`' }] }) })\n"
    const dir = project({ 'node_modules/acme/package.json': JSON.stringify({ name: 'acme', type: 'module', exports: { './plugin': './plugin.mjs' } }), 'node_modules/acme/plugin.mjs': plugin, 'weft.config.yaml': 'plugins: [acme]\n' })
    expect(want(await agentMap(dir), 'Audit log').call).toBe('`acme audit`')
  })

  it('writes both files, and weft check keeps them current once .weft exists', async () => {
    const dir = project(full)
    await writeMap(dir)
    expect(readFileSync(join(dir, '.weft/map.md'), 'utf8')).toContain('| Tables and migrations |')
    expect(JSON.parse(readFileSync(join(dir, '.weft/map.json'), 'utf8')).version).toBe(1)
    await check(dir)
    expect(existsSync(join(dir, '.weft/map.md'))).toBe(true)
  })
})
