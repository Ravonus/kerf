import { Boundary, resource } from '@kerf-js/core'
import { renderToStringAsync } from '@kerf-js/core/ssr'
import { query, type StandardSchemaV1 } from '../src/data'
import { body, serve } from './stream.fixture'

export function registerReadStallTest({
  Now,
  reset,
  count,
}: {
  Now: () => unknown
  reset: () => void
  count: () => number
}) {
  test("stops after a few passes, and the Boundary is the client's", async () => {
    reset()
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
    expect(count()).toBeLessThan(8)
    expect(Date.now() - started).toBeLessThan(1000)
    expect(html).toContain('$wb()')
    expect(diagnostics.join()).toContain('stopped reading anything new')
  })
}

export function registerReadProgressTests({
  reset,
  increment,
  count,
  typed,
}: {
  reset: () => void
  increment: () => void
  count: () => number
  typed: <T>() => StandardSchemaV1<T>
}) {
  test("a navigation's render stops too", async () => {
    reset()
    let key = 0
    let stalled = 0
    const Runaway = () => {
      const k = ++key
      const r = resource(
        () =>
          new Promise<number>((ok) => {
            increment()
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
    expect(count()).toBeLessThan(8)
    expect(stalled).toBe(1)
  })

  test('reads that each need the last are headway, however many there are', async () => {
    reset()
    const step = query({
      $id: 'stream.step',
      input: typed<number>(),
      run: ({ input }) => {
        increment()
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
    expect(count()).toBe(80)
    expect(html).toContain('>end</p>')
    expect(html).not.toContain('$wb()')
  })
}
