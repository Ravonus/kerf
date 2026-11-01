// Select's value: it lands on the select before the options exist, on the server and on the client.
import { resetIds } from '@weft/ui-core'
import { state } from 'weft'
import { hydrate } from 'weft/dom'
import { renderToString } from 'weft/ssr'
import { flush, render } from 'weft/test'
// @ts-expect-error: query imports (weft/vite)
import { Picked as server } from './fixtures/Picked.tsx?weft-ssr'
// @ts-expect-error
import { Picked as client } from './fixtures/Picked.tsx?weft-hydrate'
import { Grid } from '../src/Layout'
import { Select } from '../src/Select'

const options = [{ value: 'a', label: 'A' }, { group: 'More', options: [{ value: 'b', label: 'B' }] }, { value: 'c', label: 'C' }]

test('the server marks the chosen option, in a group too', () => {
  resetIds()
  const html = renderToString(() => server({ value: 'b' }))
  const root = document.createElement('div')
  root.innerHTML = html
  expect(root.querySelector('select')!.value).toBe('b')
  expect(root.querySelector('option[selected]')!.getAttribute('value')).toBe('b')
})

test('hydration keeps the chosen option', async () => {
  resetIds()
  const root = document.body.appendChild(document.createElement('div'))
  root.innerHTML = renderToString(() => server({ value: 'c' }))
  resetIds()
  const dispose = hydrate(() => client({ value: 'c' }), root)
  await flush()
  await Promise.resolve()
  expect(root.querySelector('select')!.value).toBe('c')
  dispose()
  root.remove()
})

test('a client render shows the value, and follows it', async () => {
  const value = state('b')
  const view = render(() => <Select label="Pick" options={options} value={value.value} />)
  await Promise.resolve()
  const select = view.container.querySelector('select')!
  expect(select.value).toBe('b')
  value.value = 'c'
  await flush()
  expect(select.value).toBe('c')
})

test('with no value the first option shows', async () => {
  const view = render(() => <Select label="Pick" options={options} />)
  await Promise.resolve()
  expect(view.container.querySelector('select')!.selectedIndex).toBe(0)
})

test('Grid takes a step or a length', () => {
  const step = render(() => <Grid min="sm" />).container.firstElementChild!
  expect(step.getAttribute('data-min')).toBe('sm')
  expect(step.getAttribute('style')).toBeNull()
  const length = render(() => <Grid min="12rem" />).container.firstElementChild!
  expect(length.getAttribute('data-min')).toBeNull()
  expect((length as HTMLElement).style.getPropertyValue('--_min').trim()).toBe('12rem')
})
