// A component whose root is only a conditional, at the very root of a hydrate: its holes stay live.
import { hydrate } from '@kerf/core/dom'
import { renderToString } from '@kerf/core/ssr'
import { flush } from '@kerf/core/test'
// @ts-expect-error: query imports (@kerf/core/vite)
const server = await import('./fixtures/Frag.tsx?kerf-ssr')
// @ts-expect-error: query imports (@kerf/core/vite)
const client = await import('./fixtures/Frag.tsx?kerf-hydrate')
test.each(['A', 'B', 'C'])('%s', async (n) => {
  const root = document.body.appendChild(document.createElement('div'))
  root.innerHTML = renderToString(() => server[n]())
  const d = hydrate(() => client[n](), root)
  root.querySelector('button')!.click()
  await flush()
  expect(root.querySelector('#shown')).not.toBeNull()
  root.querySelector('button')!.click()
  await flush()
  expect(root.querySelector('#shown')).toBeNull()
  d()
  root.remove()
})

test("a thunk building a page doesn't take its fragment's reads: toggling a part keeps the page and its state", async () => {
  const { state } = await import('@kerf/core')
  const { render } = await import('@kerf/core/test')
  let builds = 0
  const on = state(false)
  const Part = () => [() => (on.value ? 'on' : 'off')]
  const page = () => {
    builds++
    return [Part()]
  }
  const { container } = render(() => <main>{() => page}</main>)
  expect(container.textContent).toBe('off')
  on.value = true
  await flush()
  expect(container.textContent).toBe('on')
  expect(builds).toBe(1)
})
