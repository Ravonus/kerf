import { Boundary, defineState, resource, state, untrack } from '@kerf-js/core'
import { FnError } from '../src/data'
import { createHandler, type Manifest } from '../src/server'
import { body, page, serve } from './stream.fixture'

function registerProductionResourceFailureTests() {
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
}

export function registerProductionFailures() {
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
      Object.values(script(html, 'kerf-data').r as Record<string, { e?: string }>).map((r) => r.e)

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

    registerProductionResourceFailureTests()
  })
}

export function registerChunkStateTest() {
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
    const pushes = [...html.matchAll(/\|\|\[\]\)\.push\((.*?)\);\$wb/g)].map((m) =>
      JSON.parse(m[1]!),
    )
    expect(pushes.filter((p) => p.s).map((p) => p.s)).toEqual([{ 'chunk.seen': { n: 7 } }])
  })
}

export function registerAssetPreloadTests() {
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
      html.indexOf('id="kerf-data"'),
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
}
