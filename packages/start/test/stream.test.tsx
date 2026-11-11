// A streamed page on the server: what it keeps, what it sends and when.
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { Boundary, derived, resource, state } from '@kerf-js/core'
import { query, type StandardSchemaV1 } from '../src/data'
import { body, serve } from './stream.fixture'
import { registerReadProgressTests, registerReadStallTest } from './stream.reads'
import {
  registerAssetPreloadTests,
  registerChunkStateTest,
  registerProductionFailures,
} from './stream.production'

const any: StandardSchemaV1<unknown> = {
  '~standard': { version: 1, vendor: 't', validate: (v) => ({ value: v }) },
}
const typed = <T,>() => any as StandardSchemaV1<T>

// What every render reads and outlives it, as a mutation's `.pending` is.
const calls = state(0)
const pending = derived(() => calls.value > 0)
const held = () => (pending as unknown as { node: { o: unknown[] } }).node.o.length

const Row = (props: { name: string }) => {
  const busy = derived(() => pending.value)
  return <li title={String(busy.value)}>{props.name}</li>
}
const Rows = () => {
  const r = resource(() => Promise.resolve(Array.from({ length: 200 }, (_, i) => `row ${i}`)))
  return (
    <ul>
      {(r.value ?? []).map((x) => (
        <Row name={x} />
      ))}
    </ul>
  )
}
const Streamed = () => (
  <main>
    <h1>Shell</h1>
    <Boundary pending={<i>wait</i>}>
      <Rows />
    </Boundary>
  </main>
)

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
    const r = resource(
      () =>
        new Promise<string[]>((ok) => {
          land = ok
        }),
    )
    const busy = derived(() => pending.value)
    return <p title={String(busy.value)}>{r.value?.length}</p>
  }
  const get = serve({
    '/': () => (
      <main>
        <Boundary pending={<i>wait</i>}>
          <Late />
        </Boundary>
      </main>
    ),
  })
  const res = await get('/')
  const reader = res.body!.getReader()
  await reader.read()
  await reader.cancel()
  land(['a'])
  await new Promise((ok) => {
    setTimeout(ok, 20)
  })
  expect(held()).toBe(0)
})

test("a Boundary that fails replaces its fallback with its error, and the page keeps the driver's text to itself", async () => {
  const diagnostics: string[] = []
  const Broken = () => {
    const r = resource(() => Promise.reject(new Error('relation "todos" does not exist')))
    return <p>{r.value}</p>
  }
  const get = serve(
    {
      '/': () => (
        <main>
          <Boundary pending={<i>wait</i>} error={() => <b>That didn't load</b>}>
            <Broken />
          </Boundary>
        </main>
      ),
    },
    { onDiagnostic: (d) => diagnostics.push(d.message) },
  )
  const html = await body(await get('/'))
  expect(html).toContain('<template><b')
  expect(html).toContain('load</b></template>')
  expect(html).not.toContain('relation')
})

test('a Boundary with no `error` still gives up its fallback', async () => {
  const Broken = () => {
    const r = resource(() => Promise.reject(new Error('nope')))
    return <p>{r.value}</p>
  }
  const get = serve({
    '/': () => (
      <main>
        <Boundary pending={<i>wait</i>}>
          <Broken />
        </Boundary>
      </main>
    ),
  })
  expect(await body(await get('/'))).toContain('<template></template>')
})

test('a failed query in production says only that it failed, on the page and in its diagnostics it says why', async () => {
  const diagnostics: string[] = []
  const reads = query({
    $id: 'stream.reads',
    run: (): string => {
      throw new Error('relation "todos" does not exist')
    },
  })
  const Broken = () => {
    const r = reads()
    return <p>{r.value}</p>
  }
  const get = serve(
    {
      '/': () => (
        <main>
          <Boundary pending={<i>wait</i>} error={(e) => <b>{(e as Error).message}</b>}>
            <Broken />
          </Boundary>
        </main>
      ),
    },
    { onDiagnostic: (d) => diagnostics.push(d.message) },
  )
  const html = await body(await get('/'))
  expect(html).not.toContain('relation')
  expect(html).toContain('Server function failed.')
  expect(diagnostics.join()).toContain('relation')
})

test('a Boundary of reads landing one at a time renders once for them, not once each', async () => {
  // Replies a timer tick apart, each far enough from the last for a pass to run between. The window a slow read would
  // close never closes here, so this doesn't depend on how fast the machine is: the last reply is what lands them.
  const timer = globalThis.setTimeout
  const spy = vi
    .spyOn(globalThis, 'setTimeout')
    .mockImplementation(((fn: () => void, ms?: number, ...a: unknown[]) =>
      ms === 4 ? 0 : timer(fn, ms, ...(a as []))) as typeof setTimeout)
  try {
    let renders = 0
    let sent = 0
    const one = query({
      $id: 'stream.one',
      input: typed<number>(),
      run: async ({ input }) => {
        await new Promise((ok) => {
          timer(ok, ++sent)
        })
        return input
      },
    })
    const Cell = (props: { n: number }) => {
      const r = one(() => props.n)
      return <li>{r.value}</li>
    }
    const Many = () => {
      renders++
      return (
        <ul>
          {Array.from({ length: 30 }, (_, n) => (
            <Cell n={n} />
          ))}
        </ul>
      )
    }
    const get = serve({
      '/': () => (
        <main>
          <Boundary pending={<i>wait</i>}>
            <Many />
          </Boundary>
        </main>
      ),
    })
    const html = await body(await get('/'))
    expect(html).toContain('<template><ul')
    expect(html).not.toContain('$wb()')
    expect(renders).toBeLessThan(5)
  } finally {
    spy.mockRestore()
  }
})

test("a read slower than the others doesn't hold them back", async () => {
  let fast = 0,
    slow = 0
  const fastRead = query({
    $id: 'stream.fast',
    run: () => {
      fast = performance.now()
      return Promise.resolve('fast')
    },
  })
  const slowRead = query({
    $id: 'stream.slow',
    run: async () => {
      await new Promise((ok) => {
        setTimeout(ok, 120)
      })
      slow = performance.now()
      return 'slow'
    },
  })
  const Fast = () => <p>{fastRead().value}</p>
  const Slow = () => <p>{slowRead().value}</p>
  const get = serve({
    '/': () => (
      <main>
        <Boundary pending={<i>a</i>}>
          <Fast />
        </Boundary>
        <Boundary pending={<i>b</i>}>
          <Slow />
        </Boundary>
      </main>
    ),
  })
  const reader = (await get('/')).body!.getReader()
  const text = new TextDecoder()
  let html = ''
  while (!html.includes('>fast<')) html += text.decode((await reader.read()).value)
  expect(html).not.toContain('>slow<')
  expect(fast).toBeGreaterThan(0)
  expect(slow).toBe(0)
  await reader.cancel()
})

describe('a read that never settles down', () => {
  let ran = 0
  let tick = 0
  const stamped = query({
    $id: 'stream.stamped',
    input: typed<number>(),
    run: ({ input }) => {
      ran++
      return Promise.resolve(input)
    },
  })
  const Now = () => {
    const r = stamped(++tick)
    return <p>{r.value}</p>
  }

  registerReadStallTest({
    Now,
    reset: () => {
      ran = 0
    },
    count: () => ran,
  })

  test("doesn't cost a slow read beside it its chunk", async () => {
    ran = 0
    const slow = query({
      $id: 'stream.beside',
      run: async () => {
        await new Promise((ok) => {
          setTimeout(ok, 150)
        })
        return 'arrived'
      },
    })
    const Slow = () => {
      const r = slow()
      return <p>{r.value}</p>
    }
    const get = serve({
      '/': () => (
        <main>
          <Boundary pending={<i>a</i>}>
            <Now />
          </Boundary>
          <Boundary pending={<i>b</i>}>
            <Slow />
          </Boundary>
        </main>
      ),
    })
    const html = await body(await get('/'))
    expect(html).toContain('<template><p')
    expect(html).toContain('arrived')
    expect(ran).toBeLessThan(16)
  })

  registerReadProgressTests({
    reset: () => {
      ran = 0
    },
    increment: () => {
      ran++
    },
    count: () => ran,
    typed,
  })
})

registerProductionFailures()
registerChunkStateTest()
registerAssetPreloadTests()
