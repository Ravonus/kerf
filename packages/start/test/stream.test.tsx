// A streamed page on the server: what it keeps, what it sends and when.
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { Boundary, derived, resource, state } from 'weft'
import { query } from '../src/data'
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

const body = (res: Response) => res.text()

test('a Boundary that fails replaces its fallback with its error, and the page keeps the driver\'s text to itself', async () => {
  const diagnostics: string[] = []
  const Broken = () => {
    const r = resource(() => Promise.reject(new Error('relation "todos" does not exist')))
    return <p>{r.value}</p>
  }
  const get = serve({ '/': () => <main><Boundary pending={<i>wait</i>} error={() => <b>That didn't load</b>}><Broken /></Boundary></main> }, { onDiagnostic: (d: any) => diagnostics.push(d.message) })
  const html = await body(await get('/'))
  expect(html).toContain("<template><b")
  expect(html).toContain('load</b></template>')
  expect(html).not.toContain('relation')
})

test('a Boundary with no `error` still gives up its fallback', async () => {
  const Broken = () => {
    const r = resource(() => Promise.reject(new Error('nope')))
    return <p>{r.value}</p>
  }
  const get = serve({ '/': () => <main><Boundary pending={<i>wait</i>}><Broken /></Boundary></main> })
  expect(await body(await get('/'))).toContain('<template></template>')
})

test('a failed query in production says only that it failed, on the page and in its diagnostics it says why', async () => {
  const diagnostics: string[] = []
  const reads = query({ $id: 'stream.reads', run: () => { throw new Error('relation "todos" does not exist') } } as any) as any
  const Broken = () => {
    const r = reads()
    return <p>{r.value}</p>
  }
  const get = serve({ '/': () => <main><Boundary pending={<i>wait</i>} error={(e: any) => <b>{e.message}</b>}><Broken /></Boundary></main> }, { onDiagnostic: (d: any) => diagnostics.push(d.message) })
  const html = await body(await get('/'))
  expect(html).not.toContain('relation')
  expect(html).toContain('Server function failed.')
  expect(diagnostics.join()).toContain('relation')
})

test('a Boundary of many reads landing one at a time finishes, in a few passes', async () => {
  let renders = 0
  const one = query({ $id: 'stream.one', run: async ({ input }: any) => { await new Promise(ok => setTimeout(ok, input % 7)); return input } } as any) as any
  const Cell = (props: { n: number }) => {
    const r = one(() => props.n)
    return <li>{r.value}</li>
  }
  const Many = () => {
    renders++
    return <ul>{Array.from({ length: 120 }, (_, n) => <Cell n={n} />)}</ul>
  }
  const get = serve({ '/': () => <main><Boundary pending={<i>wait</i>}><Many /></Boundary></main> })
  const html = await body(await get('/'))
  expect(html).toContain('<template><ul')
  expect(html).not.toContain('$wb()')
  expect(renders).toBeLessThan(12)
})

test('modulepreloads come before the page\'s styles', async () => {
  const get = serve({ '/': () => <h1>Hi</h1> }, { assets: { entry: '/e.js', js: [{ href: '/a.js' }], css: [{ href: '/s.css' }], inline: { '/s.css': 'h1{color:red}' } } })
  const html = await body(await get('/'))
  expect(html.indexOf('modulepreload')).toBeGreaterThan(0)
  expect(html.indexOf('modulepreload')).toBeLessThan(html.indexOf('<style'))
})
