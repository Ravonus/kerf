// `.weft/contract.json` (research 28 §4): functions as JSON Schema with tags, cache and auth; C001 for a schema with
// no converter, C002 for a value its `output` rejects; Q012 when the database or auth reaches the client graph.
import { z } from 'zod'
import { describe as contract } from '../src/contract.mjs'
import { createScope, fetchQuery } from '../src/exec'
import weftStart from '../src/vite.mjs'

const fn = (kind, $id, def) => ({ kind, $id, def })
const bare = { '~standard': { version: 1, vendor: 't', validate: v => ({ value: v }) } }

test('one entry per function, sorted, in JSON Schema', () => {
  const { functions, diagnostics } = contract(new Map([
    ['b', fn('mutation', 'addTodo.a1b2c3', { input: z.object({ title: z.string().min(1) }), output: z.object({ id: z.string() }), auth: 'user', invalidates: ['todos'] })],
    ['a', fn('query', 'listTodos.d4e5f6', { tags: ['todos'], cache: { life: 'minutes', scope: 'user' } })],
    ['c', fn('query', 'getTodo.000000', { input: z.object({ id: z.string() }), tags: ({ id }) => [`todo:${id}`] })],
    ['d', fn('mutation', 'rename.111111', { invalidates: () => [] })],
  ]))
  expect(diagnostics).toEqual([])
  expect(functions.map(f => f.name)).toEqual(['addTodo', 'getTodo', 'listTodos', 'rename'])
  expect(functions[0]).toMatchObject({
    id: 'addTodo.a1b2c3', kind: 'mutation', invalidates: ['todos'], auth: 'user', errors: ['Q002', 'A002', 'Q010'],
    input: { type: 'object', required: ['title'], properties: { title: { type: 'string', minLength: 1 } } },
    output: { type: 'object', required: ['id'] },
  })
  expect(functions[1]).toMatchObject({ tags: 'dynamic', cache: null, auth: 'public', errors: ['Q002'] })
  expect(functions[2]).toMatchObject({ input: null, output: null, tags: ['todos'], cache: { life: 'minutes', scope: 'user' } })
  expect(functions[3]).toMatchObject({ invalidates: 'dynamic' })
})

test('C001: a schema with no JSON Schema is `{}` and a warning', () => {
  const { functions, diagnostics } = contract(new Map([['a', fn('query', 'odd', { input: bare })]]))
  expect(functions[0].input).toEqual({})
  expect(diagnostics).toMatchObject([{ code: 'C001', severity: 'warning' }])
  expect(diagnostics[0].why).toContain('`odd`')
})

test('C002: dev and tests check the value against `output`; production doesn\'t', async () => {
  const f = fn('query', 'typed', { output: z.object({ id: z.string() }), run: () => ({ id: 1 }) })
  const dev = createScope(new Request('http://localhost/'), { dev: true })
  await expect(fetchQuery(dev, f, undefined)).rejects.toMatchObject({ code: 'C002', message: expect.stringContaining('id:') })
  expect((await fetchQuery(createScope(new Request('http://localhost/')), f, undefined)).v).toEqual({ id: 1 })
})

test('Q012: the database or auth in the client graph stops the build; on the server it passes through', () => {
  const plugin = weftStart({ root: import.meta.dirname }).find?.(p => p.resolveId?.handler) ?? weftStart({ root: import.meta.dirname })
  const { handler, filter } = plugin.resolveId
  for (const id of ['@weft/start/db', '@weft/start/db/sqlite', '@weft/start/db/postgres', '@weft/start/auth']) expect(filter.id.test(id)).toBe(true)
  expect(filter.id.test('@weft/start/data')).toBe(false)
  const ctx = consumer => ({ environment: { config: { consumer } }, error(m) { throw new Error(m) } })
  expect(() => handler.call(ctx('client'), '@weft/start/db/sqlite', `${import.meta.dirname}/page.tsx`)).toThrow(/^Q012: .*page\.tsx/)
  expect(handler.call(ctx('server'), '@weft/start/auth', 'x')).toBeUndefined()
})
