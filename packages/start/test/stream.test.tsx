// A streamed page on the server: what it keeps, what it sends and when.
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { Boundary, defineState, derived, resource, state, untrack } from '@weft-js/core'
import { renderToStringAsync } from '@weft-js/core/ssr'
import { FnError, query, type StandardSchemaV1 } from '../src/data'
import { createHandler, type HandlerOptions, type Manifest } from '../src/server'

const any: StandardSchemaV1<unknown> = {
  '~standard': { version: 1, vendor: 't', validate: (v) => ({ value: v }) },
}
const typed = <T,>() => any as StandardSchemaV1<T>

const page = (id: string, file: string) => ({
  id,
  file,
  layouts: [],
  pattern: id,
  params: [],
  kind: 'page' as const,
})
// `hold: 0`: these are of what streams, and their reads land within the default hold.
const serve = (routes: Record<string, () => unknown>, options: Partial<HandlerOptions> = {}) => {
  const manifest: Manifest = {
    dir: 'src/routes',
    layouts: [],
    routes: Object.keys(routes).map((p) => page(p, p)),
  }
  const handler = createHandler({
    manifest,
    modules: Object.fromEntries(Object.entries(routes).map(([p, c]) => [p, { default: c }])),
    hold: 0,
    ...options,
  })
  return (path: string) => handler(new Request(`http://localhost${path}`))
}

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

const body = (res: Response) => res.text()

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

  test("stops after a few passes, and the Boundary is the client's", async () => {
    ran = 0
    const diagnostics: string[] = []
    const started = Date.now()
    const get = serve(
      {
        '/': () => (
          <main>
            <Boundary pending={<i>wait</i>}>
              <Now />
            </Boundary>
          </main>
        ),
      },
      { onDiagnostic: (d) => diagnostics.push(d.message) },
    )
    const html = await body(await get('/'))
    expect(ran).toBeLessThan(8)
    expect(Date.now() - started).toBeLessThan(1000)
    expect(html).toContain('$wb()')
    expect(diagnostics.join()).toContain('stopped reading anything new')
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

  test("a navigation's render stops too", async () => {
    ran = 0
    let key = 0
    let stalled = 0
    const Runaway = () => {
      const k = ++key
      const r = resource(
        () =>
          new Promise<number>((ok) => {
            ran++
            setTimeout(ok, 0, k)
          }),
        { data: false },
      )
      return <p>{r.value}</p>
    }
    await renderToStringAsync(
      () => (
        <Boundary pending={<i>wait</i>}>
          <Runaway />
        </Boundary>
      ),
      { passes: 1024, stalled: () => stalled++ },
    )
    expect(ran).toBeLessThan(8)
    expect(stalled).toBe(1)
  })

  test('reads that each need the last are headway, however many there are', async () => {
    ran = 0
    const step = query({
      $id: 'stream.step',
      input: typed<number>(),
      run: ({ input }) => {
        ran++
        return Promise.resolve(input)
      },
    })
    const Chain = (props: { n: number }) => {
      const r = step(() => props.n)
      return (
        <div>
          {r.value === undefined ? null : props.n === 79 ? <p>end</p> : <Chain n={props.n + 1} />}
        </div>
      )
    }
    const get = serve({
      '/': () => (
        <main>
          <Boundary pending={<i>wait</i>}>
            <Chain n={0} />
          </Boundary>
        </main>
      ),
    })
    const html = await body(await get('/'))
    expect(ran).toBe(80)
    expect(html).toContain('>end</p>')
    expect(html).not.toContain('$wb()')
  })
})

describe('what a failure may say in production', () => {
  const script = (html: string, id: string) =>
    JSON.parse(html.slice(html.lastIndexOf(`id="${id}">`) + id.length + 6).split('</script>')[0]!)
  const View = (props: { data: { list: Promise<string> } }) => {
    const Read = () => {
      const r = resource(() => props.data.list)
      return <p>{r.value}</p>
    }
    return (
      <main>
        <Boundary pending={<i>wait</i>} error={(e) => <b>{(e as Error).message}</b>}>
          <Read />
        </Boundary>
      </main>
    )
  }
  const deferred = async (e: unknown, hold = 0) => {
    const diagnostics: string[] = []
    const manifest: Manifest = { dir: 'src/routes', layouts: [], routes: [page('/', '/')] }
    const load = () =>
      Promise.resolve({
        list: new Promise((_, no) => {
          setTimeout(no, 5, e)
        }),
      })
    const handler = createHandler({
      manifest,
      modules: { '/': { default: View, load } },
      onDiagnostic: (d) => diagnostics.push(d.message),
      hold,
    })
    return { html: await body(await handler(new Request('http://localhost/'))), diagnostics }
  }
  const failure = (html: string) =>
    Object.values(script(html, 'weft-data').r as Record<string, { e?: string }>).map((r) => r.e)

  test("a deferred field that rejects keeps a driver's text out of the HTML and the data", async () => {
    const { html, diagnostics } = await deferred(
      new Error('relation "secret_table" does not exist'),
    )
    expect(html).not.toContain('secret_table')
    expect(html).toContain('<template><b')
    expect(html).toContain('Server function failed.</b></template>')
    expect(new Set(failure(html))).toEqual(new Set(['Server function failed.']))
    expect(diagnostics.join()).toContain('secret_table')
  })

  test('one that rejects within the hold renders its error in the page, saying as little', async () => {
    const { html, diagnostics } = await deferred(
      new Error('relation "secret_table" does not exist'),
      25,
    )
    expect(html).not.toContain('secret_table')
    expect(html).not.toContain('<template>')
    expect(html).toMatch(/<b[^>]*>Server function failed\.<\/b>/)
    expect(new Set(failure(html))).toEqual(new Set(['Server function failed.']))
    expect(diagnostics.join()).toContain('secret_table')
  })

  test('a deliberate message in a deferred field reads the same in the HTML and the data', async () => {
    const { html } = await deferred(new FnError({ message: 'That order has closed' }, 409))
    expect(html).toContain('That order has closed</b></template>')
    expect(new Set(failure(html))).toEqual(new Set(['That order has closed']))
  })

  test('a plain resource, a fetcher that throws and a child that throws say as little', async () => {
    const secret = () => new Error('password authentication failed for user "root"')
    const Rejects = () => <p>{resource(() => Promise.reject(secret())).value}</p>
    const Throws = () => (
      <p>
        {
          resource((): string => {
            throw secret()
          }).value
        }
      </p>
    )
    const Dies = (): unknown => {
      throw secret()
    }
    for (const Kid of [Rejects, Throws, Dies]) {
      const get = serve({
        '/': () => (
          <main>
            <Boundary pending={<i>wait</i>} error={(e) => <b>{(e as Error).message}</b>}>
              <Kid />
            </Boundary>
          </main>
        ),
      })
      const html = await body(await get('/'))
      expect(html).not.toContain('password')
      expect(html).toContain('Server function failed.')
    }
  })

  test("a resource's own error, read with no Boundary, says as little", async () => {
    const Own = () => {
      const r = resource(() => Promise.reject(new Error('relation "secret_table" does not exist')))
      return <p>{(r.error as Error)?.message}</p>
    }
    const html = await body(
      await serve({
        '/': () => (
          <main>
            <Own />
          </main>
        ),
      })('/'),
    )
    expect(html).not.toContain('secret_table')
  })
})

test("a chunk says what its render changed of the page's state, once", async () => {
  const seen = defineState('chunk.seen', () => ({ n: state(0) }))
  const Late = () => {
    const r = resource(
      () =>
        new Promise<number>((ok) => {
          setTimeout(ok, 5, 7)
        }),
    )
    seen.n.value = untrack(() => r.value) ?? 0
    return <p>{r.value}</p>
  }
  const Later = () => (
    <p>
      {
        resource(
          () =>
            new Promise<string>((ok) => {
              setTimeout(ok, 30, 'x')
            }),
        ).value
      }
    </p>
  )
  const get = serve({
    '/': () => (
      <main>
        <Boundary pending={<i>a</i>}>
          <Late />
        </Boundary>
        <Boundary pending={<i>b</i>}>
          <Later />
        </Boundary>
      </main>
    ),
  })
  const html = await body(await get('/'))
  const pushes = [...html.matchAll(/\|\|\[\]\)\.push\((.*?)\);\$wb/g)].map((m) => JSON.parse(m[1]!))
  expect(pushes.filter((p) => p.s).map((p) => p.s)).toEqual([{ 'chunk.seen': { n: 7 } }])
})

test("a streamed page's entry is preloaded above its styles, with its script after what it reads", async () => {
  const Late = () => (
    <p>
      {
        resource(
          () =>
            new Promise<string>((ok) => {
              setTimeout(ok, 5, 'late')
            }),
        ).value
      }
    </p>
  )
  const get = serve(
    {
      '/': () => (
        <main>
          <Boundary pending={<i>wait</i>}>
            <Late />
          </Boundary>
        </main>
      ),
    },
    {
      assets: {
        entry: '/e.js',
        js: [{ href: '/a.js' }],
        css: [{ href: '/s.css' }],
        inline: { '/s.css': 'h1{color:red}' },
      },
    },
  )
  const html = await body(await get('/'))
  const preload = html.indexOf('<link rel="modulepreload" href="/e.js">')
  expect(preload).toBeGreaterThan(0)
  expect(preload).toBeLessThan(html.indexOf('<style'))
  expect(html.indexOf('<script type="module" async src="/e.js">')).toBeGreaterThan(
    html.indexOf('id="weft-data"'),
  )
})

test("modulepreloads come before the page's styles", async () => {
  const get = serve(
    { '/': () => <h1>Hi</h1> },
    {
      assets: {
        entry: '/e.js',
        js: [{ href: '/a.js' }],
        css: [{ href: '/s.css' }],
        inline: { '/s.css': 'h1{color:red}' },
      },
    },
  )
  const html = await body(await get('/'))
  expect(html.indexOf('modulepreload')).toBeGreaterThan(0)
  expect(html.indexOf('modulepreload')).toBeLessThan(html.indexOf('<style'))
})
