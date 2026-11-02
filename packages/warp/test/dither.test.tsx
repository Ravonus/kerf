// Canvas and the dither family: markup, a11y, the server's output, and that one app's bytes aren't another's.
import { resetIds } from '@weft-js/warp-core'
import { hydrate } from '@weft-js/core/dom'
import { renderToString } from '@weft-js/core/ssr'
import { flush, render } from '@weft-js/core/test'
import { hydration } from '../../weft/src/hydrate'
import { Canvas, Dither, DitherField, DitherGlyph } from '../src/index'
// @ts-expect-error: query imports (@weft-js/core/vite)
const server = await import('./fixtures/pack-dither.tsx?weft-ssr')
// @ts-expect-error: query imports (@weft-js/core/vite)
const client = await import('./fixtures/pack-dither.tsx?weft-hydrate')

test('a field is decorative by default, and named with a label', async () => {
  const { container } = render(() => <><DitherField /><DitherField label="Slow waves" /></>)
  await flush()
  const [a, b] = container.querySelectorAll<HTMLElement>('[data-scope="dither"]')
  expect(a!.getAttribute('role')).toBe(null)
  expect(a!.querySelector('canvas')!.getAttribute('aria-hidden')).toBe('true')
  expect(b!.getAttribute('role')).toBe('img')
  expect(b!.getAttribute('aria-label')).toBe('Slow waves')
  expect(a!.getAttribute('style')).toContain('16 / 9')
})

test('fill drops the ratio, children stay readable over the canvas, and attributes reach the host', async () => {
  const { container } = render(() => <DitherField fill id="bg"><h2>Hello</h2></DitherField>)
  await flush()
  const host = container.querySelector<HTMLElement>('#bg')!
  expect(host.hasAttribute('data-fill')).toBe(true)
  expect(host.getAttribute('style') ?? '').not.toContain('aspect-ratio')
  expect(host.querySelector('h2')!.closest('[aria-hidden]')).toBe(null)
})

test('a glyph word stays in the page as text; a logo takes a label', async () => {
  const { container } = render(() => <><DitherGlyph text="warp" /><DitherGlyph path="M0 0h24v24z" label="weft" /></>)
  await flush()
  const [word, logo] = container.querySelectorAll<HTMLElement>('[data-scope="dither"]')
  expect(word!.textContent).toBe('warp')
  expect(word!.getAttribute('role')).toBe(null)
  expect(logo!.getAttribute('aria-label')).toBe('weft')
})

test('an image keeps its <img> and alt underneath', async () => {
  const { container } = render(() => <Dither src="/a.png" alt="A lit sphere" />)
  await flush()
  expect(container.querySelector('img')!.getAttribute('alt')).toBe('A lit sphere')
  expect(container.querySelector('img')!.getAttribute('loading')).toBe('lazy')
})

test('Canvas names its drawing or hides it', async () => {
  const { container } = render(() => <><Canvas draw={() => {}} /><Canvas draw={() => {}} label="Plot" /></>)
  await flush()
  const [a, b] = container.querySelectorAll('canvas')
  expect(a!.getAttribute('aria-hidden')).toBe('true')
  expect(b!.getAttribute('role')).toBe('img')
})

test('every host is server-rendered and hydrates with 0 misses and 0 writes: the canvas only starts after', () => {
  resetIds()
  const html = renderToString(() => server.Case())
  expect(html, html).toMatch(/data-scope="?dither/)
  expect(html).toMatch(/data-scope="?canvas/)
  const root = document.body.appendChild(document.createElement('div'))
  root.innerHTML = html
  const writes: MutationRecord[] = []
  const observer = new MutationObserver(r => writes.push(...r))
  observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  resetIds()
  const dispose = hydrate(() => client.Case(), root)
  writes.push(...observer.takeRecords())
  observer.disconnect()
  expect(writes).toHaveLength(0)
  expect(hydration.misses).toBe(0)
  expect(warn).not.toHaveBeenCalled()
  warn.mockRestore()
  dispose()
  root.remove()
})
