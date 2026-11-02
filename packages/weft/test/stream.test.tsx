// renderToStream (research 25 §4): the shell goes out with pending Boundaries' fallbacks between markers, then each
// Boundary's content as its resources resolve, in resolve order, and hydration of the swapped page is 0 misses and
// 0 DOM writes. The server and client compile the same fixture (`?weft-ssr` / `?weft-hydrate`, vite.mjs).
// weft-allow T005: framework test of streaming SSR; server markup, chunk order and node identity are the subject
// weft-allow T004: the stream interleaves resolves with its own macrotask ticks and timeout, so resolve order needs real timers
import { renderToStream, SWAP } from '@weft-js/core/ssr'
import { hydrate } from '@weft-js/core/dom'
import { hydration } from '../src/hydrate'
// @ts-expect-error: query imports (vite.mjs)
import { Bare as ServerBare, Page as ServerPage } from './fixtures/ssr/Streamed.tsx?weft-ssr'
// @ts-expect-error
import { Page as ClientPage } from './fixtures/ssr/Streamed.tsx?weft-hydrate'

const later = <T,>(ms: number, v: T) => new Promise<T>(ok => setTimeout(ok, ms, v))

async function stream(load: (what: string) => Promise<string>) {
  const s = renderToStream(() => <ServerPage load={load} />)
  const chunks: string[] = []
  for await (const c of s.chunks) chunks.push(c)
  return { shell: s.shell, chunks, data: s.data() }
}

/** What a browser does with the stream: the shell in the container, each chunk's template swapped in by `$wb`. */
function apply(shell: string, chunks: string[]) {
  const container = document.body.appendChild(document.createElement('div'))
  container.innerHTML = shell
  const $wb = new Function(`${SWAP};return $wb`)()
  for (const c of chunks) {
    const holder = document.createElement('div')
    holder.innerHTML = c
    for (const script of holder.querySelectorAll('script')) {
      const t = script.previousElementSibling as HTMLTemplateElement | null
      if (t) document.body.appendChild(t)
      const call = /\$wb\(("[^"]*")?\)$/.exec(script.textContent)!
      $wb(call[1] ? JSON.parse(call[1]) : undefined, t ?? undefined)
    }
  }
  return container
}

afterEach(() => { document.body.innerHTML = '' })

test('the shell has every fallback; content streams in the order resources resolve', async () => {
  const { shell, chunks } = await stream(what => later(what === 'fast' ? 5 : 40, `${what} data`))
  expect(shell).toContain('<h1>Streamed</h1>')
  expect(shell.match(/<!--wb:/g)).toHaveLength(2)
  expect(shell).toContain('Loading fast')
  expect(shell).toContain('Loading slow')
  expect(shell).not.toContain('fast data')
  expect(chunks).toHaveLength(2)
  expect(chunks[0]).toContain('fast data')
  expect(chunks[0]).toContain('$wb=function') // defined once, with the first chunk
  expect(chunks[1]).toContain('slow data')
  expect(chunks[1]).not.toContain('$wb=function')
})

test('settle(): a resource outside every Boundary lands in the shell, and its value in the data', async () => {
  const s = renderToStream(() => <ServerBare load={what => later(5, `${what} data`)} />)
  expect(s.shell).not.toContain('bare data')
  await s.settle()
  expect(s.shell).toContain('bare data')
  for await (const _ of s.chunks); // nothing pending: the stream ends
  expect(JSON.stringify(s.data())).toContain('bare data')
})

test('a Boundary that resolves while another is pending sends only its own content, once', async () => {
  let calls = 0
  const { chunks } = await stream(what => (calls++, later(what === 'fast' ? 5 : 30, what)))
  expect(calls).toBe(2) // later passes wait on the in-flight fetch instead of starting another
  expect(chunks.join('').match(/<template>/g)).toHaveLength(2)
})

test('the swapped page hydrates with 0 misses and 0 DOM writes', async () => {
  const { shell, chunks, data } = await stream(what => later(what === 'fast' ? 5 : 20, `${what} data`))
  const container = apply(shell, chunks)
  expect(container.innerHTML).not.toContain('wb:')
  expect(container.textContent).toContain('fast data')
  expect(container.textContent).toContain('slow data')
  const before = [...container.querySelectorAll('*')]
  const mutations: MutationRecord[] = []
  const observer = new MutationObserver(r => mutations.push(...r))
  observer.observe(container, { subtree: true, childList: true, attributes: true, characterData: true })
  const load = vi.fn(() => new Promise<string>(() => {}))
  hydrate(() => <ClientPage load={load} />, container, { data })
  mutations.push(...observer.takeRecords())
  observer.disconnect()
  expect(hydration.misses).toBe(0)
  expect(mutations).toHaveLength(0)
  expect(before.every(e => e.isConnected)).toBe(true)
})

test('past the timeout, what is still pending keeps its fallback and the markers go', async () => {
  const s = renderToStream(() => <ServerPage load={(what: string) => (what === 'fast' ? later(5, 'fast data') : new Promise(() => {}))} />, { timeout: 60 })
  const chunks: string[] = []
  for await (const c of s.chunks) chunks.push(c)
  expect(chunks).toHaveLength(2)
  expect(chunks[1]).toMatch(/\$wb\(\)<\/script>$/)
  const container = apply(s.shell, chunks)
  expect(container.innerHTML).not.toContain('wb:')
  expect(container.textContent).toContain('Loading slow')
  expect(s.data()!.b).toMatchObject({})
})
