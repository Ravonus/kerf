// A streamed page on the server: what it keeps, what it sends and when.
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { Boundary, derived, resource, state } from 'weft'
import { createHandler, type Manifest } from '../src/server'

const page = (id: string, file: string) => ({ id, file, layouts: [], pattern: id, params: [], kind: 'page' as const })
const serve = (routes: Record<string, () => unknown>, options: object = {}) => {
  const manifest: Manifest = { dir: 'src/routes', layouts: [], routes: Object.keys(routes).map(p => page(p, p)) }
  const handler = createHandler({ manifest, modules: Object.fromEntries(Object.entries(routes).map(([p, c]) => [p, { default: c }])) as any, ...options })
  return (path: string) => handler(new Request(`http://localhost${path}`))
}

// What every render reads and outlives it, as a mutation's `.pending` is.
const calls = state(0)
const pending = derived(() => calls.value > 0)
const held = () => (pending as any).node.o.length as number

const Row = (props: { name: string }) => {
  const busy = derived(() => pending.value)
  return <li title={String(busy.value)}>{props.name}</li>
}
const Rows = () => {
  const r = resource(() => Promise.resolve(Array.from({ length: 200 }, (_, i) => `row ${i}`)))
  return <ul>{(r.value ?? []).map(x => <Row name={x} />)}</ul>
}
const Streamed = () => <main><h1>Shell</h1><Boundary pending={<i>wait</i>}><Rows /></Boundary></main>

test('a streamed render leaves nothing subscribed to what outlives it', async () => {
  const get = serve({ '/': Streamed })
  await (await get('/')).text()
  expect(held()).toBe(0)
})

test('repeated streamed requests do not grow the retained heap', async () => {
  setFlagsFromString('--expose-gc')
  const gc = runInNewContext('gc') as () => void
  const get = serve({ '/': Streamed })
  const round = async () => {
    for (let i = 0; i < 40; i++) await (await get('/')).text()
    gc()
    return process.memoryUsage().heapUsed
  }
  await round() // the first requests warm code and caches
  const first = await round()
  let last = first
  for (let i = 0; i < 3; i++) last = await round()
  expect(last - first).toBeLessThan(2 * 1024 * 1024)
})

test('a request that goes away mid-stream leaves nothing subscribed either', async () => {
  let land = (_: string[]) => {}
  const Late = () => {
    const r = resource(() => new Promise<string[]>(ok => (land = ok)))
    const busy = derived(() => pending.value)
    return <p title={String(busy.value)}>{r.value?.length}</p>
  }
  const get = serve({ '/': () => <main><Boundary pending={<i>wait</i>}><Late /></Boundary></main> })
  const res = await get('/')
  const reader = res.body!.getReader()
  await reader.read()
  await reader.cancel()
  land(['a'])
  await new Promise(ok => setTimeout(ok, 20))
  expect(held()).toBe(0)
})
