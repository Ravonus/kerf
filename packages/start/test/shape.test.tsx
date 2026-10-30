// @vitest-environment jsdom
// query.shape and last-seen shapes (research 31): the same app code on the fake transport. A skeleton for new args
// takes the query's last value, masked; with nothing seen it comes from the `output` schema and a declared `shape`.
// weft-allow T004, T005: fake timers drive the Boundary's timing; the skeleton's structure is the behaviour under test
import { Boundary } from 'weft'
import { flush, net, render } from 'weft/test'
import { z } from 'zod'
import { cache, query, runtime } from '../src/data'
import { schemaTree, shapeTree } from '../src/shape.mjs'

const list = query({
  input: z.object({ limit: z.number(), page: z.number().optional() }),
  output: z.array(z.object({ id: z.number(), title: z.string().max(20) })),
  run: ({ input }) => Array.from({ length: input.limit }, (_, i) => ({ id: i, title: `Post ${i}` })),
})
const declared = query({ shape: [{ title: 'Release notes for 0.4' }, { title: 'Two' }], run: () => [{ title: 'x' }] })

function Feed(props: { page: number; limit: number }) {
  const posts = list(() => ({ limit: props.limit, page: props.page }))
  return <ul>{(posts.value ?? []).map(p => <li key={p.id}>{p.title}</li>)}</ul>
}

const Page = (props: { page: number; limit: number }) => <Boundary pending="shape"><Feed page={props.page} limit={props.limit} /></Boundary>
const bars = () => [...document.querySelectorAll('li [data-skeleton]')].map(b => b.textContent)

// The fake transport loads the executor on its first call; a skeleton needs it first, as the server has it.
beforeAll(async () => { runtime.exec = await import('../src/exec') })
beforeEach(() => {
  vi.useFakeTimers()
  net.latency(300)
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

test('nothing seen: the schema, sized by the limit', async () => {
  render(Page, { page: 1, limit: 2 })
  await vi.advanceTimersByTimeAsync(150)
  expect(bars()).toEqual(['nnnnn nnnn', 'nnnnn nnnn']) // the midpoint of .max(20)
  await vi.advanceTimersByTimeAsync(600)
  await flush()
  expect(bars()).toEqual([])
  expect(document.querySelectorAll('li').length).toBe(2)
})

test('last seen: other args of the same query take its count and word shape, with none of its text', async () => {
  const off = render(Page, { page: 1, limit: 3 })
  await vi.advanceTimersByTimeAsync(800)
  await flush()
  expect(document.querySelector('li')!.textContent).toBe('Post 0')
  off.unmount?.()
  document.body.innerHTML = ''
  render(Page, { page: 2, limit: 3 })
  await vi.advanceTimersByTimeAsync(150)
  expect(bars()).toEqual(['Xnni 0', 'Xnni 0', 'Xnni 0'])
})

test('the same args hold their value: no skeleton at all', async () => {
  const done = list.fetch({ limit: 1, page: 3 })
  await vi.advanceTimersByTimeAsync(400)
  await done
  document.body.innerHTML = ''
  render(Page, { page: 3, limit: 1 })
  await vi.advanceTimersByTimeAsync(200)
  expect(bars()).toEqual([])
})

test('q.shape(input), and a declared example', async () => {
  expect(list.shape({ limit: 1 })).toEqual([{ id: 0, title: 'nnnnn nnnn' }])
  expect(declared.shape()).toEqual([{ title: 'Release notes for 0.4' }, { title: 'Two' }])
  expect(cache.get(declared)).toBeUndefined()
})

test('schemaTree', () => {
  const s = (v: z.ZodType) => schemaTree(v.toJSONSchema())
  expect(s(z.string())).toEqual({ $u: 16 })
  expect(s(z.string().length(5))).toEqual({ $s: 5 })
  expect(s(z.string().min(10).max(20))).toEqual({ $s: 15 })
  expect(s(z.email())).toEqual({ $s: 22 })
  expect(s(z.string().meta({ example: 'Hi there' }))).toBe('Hi there')
  expect(s(z.object({ title: z.string(), note: z.string() }))).toEqual({ title: { $s: 40 }, note: { $u: 16 } })
  expect(s(z.object({ a: z.number().optional(), b: z.string().nullable(), c: z.boolean() }))).toEqual({ b: null, c: false })
  expect(s(z.array(z.number()).max(4))).toEqual({ $a: 4, $of: 0 })
  expect(s(z.array(z.number()))).toEqual({ $of: 0 })
  expect(s(z.enum(['a', 'b']))).toBe('a')
})

test('a declared shape goes over the schema', () => {
  const output = z.array(z.object({ title: z.string(), body: z.string().max(8) }))
  expect(shapeTree({ output, shape: [{ title: 'Example' }] })).toEqual({ $of: { title: 'Example', body: { $s: 4 } } })
  expect(shapeTree({ shape: [1] })).toEqual([1])
  expect(shapeTree({})).toBeUndefined()
})
