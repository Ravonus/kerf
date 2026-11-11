// The compiler lowers a list over an array nothing re-reads to a plain `.map`. Server, hydration and updates stay the same.
// kerf-allow T005: framework test of hydration; node identity is the subject
import { flush } from '@kerf-js/core'
import { hydrate } from '@kerf-js/core/dom'
import { renderToString } from '@kerf-js/core/ssr'
import { Grid as ServerGrid } from './fixtures/ssr/FixedList.tsx?kerf-ssr'
import { Grid, write } from './fixtures/ssr/FixedList.tsx?kerf-hydrate'

test('it renders, hydrates over the same nodes and stays live', () => {
  const html = renderToString(() => ServerGrid())
  const box = document.createElement('div')
  box.innerHTML = html
  expect(box.textContent).toBe('012')
  const first = box.querySelector('i')
  const dispose = hydrate(() => Grid(), box)
  expect(box.querySelector('i')).toBe(first)
  write(1, 9)
  flush()
  expect(box.textContent).toBe('092')
  dispose()
})
