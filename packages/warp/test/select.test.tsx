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

test('with no value, a pick survives new options, and falls back once it is gone', async () => {
  const list = state(options)
  const view = render(() => <Select label="Pick" options={list.value} />)
  await Promise.resolve()
  const select = view.container.querySelector('select')!
  select.value = 'c'
  select.dispatchEvent(new Event('change', { bubbles: true }))
  list.value = [{ value: 'c', label: 'C' }, { value: 'a', label: 'A' }]
  await flush()
  expect(select.value).toBe('c')
  list.value = [{ value: 'a', label: 'A' }, { value: 'c', label: 'See' }]
  await flush()
  expect(select.value).toBe('c')
  list.value = [{ value: 'z', label: 'Z' }, { value: 'y', label: 'Y' }]
  await flush()
  expect(select.value).toBe('z')
})

test('with a value, new options keep it, and keep a pick the parent has not answered', async () => {
  const list = state(options), value = state('a')
  const view = render(() => <Select label="Pick" options={list.value} value={value.value} />)
  await Promise.resolve()
  const select = view.container.querySelector('select')!
  list.value = [{ value: 'z', label: 'Z' }, { value: 'a', label: 'A' }]
  await flush()
  expect(select.value).toBe('a')
  list.value = [{ value: 'z', label: 'Z' }, { value: 'a', label: 'A' }, { value: 'b', label: 'B' }]
  await flush()
  select.value = 'b'
  select.dispatchEvent(new Event('change', { bubbles: true }))
  list.value = [{ value: 'b', label: 'B' }, { value: 'a', label: 'A' }]
  await flush()
  expect(select.value).toBe('b')
  value.value = 'b'
  await flush()
  value.value = 'a'
  await flush()
  expect(select.value).toBe('a')
})

test('options that arrive after the value show it', async () => {
  const list = state<typeof options>([])
  const view = render(() => <Select label="Pick" options={list.value} value="c" />)
  await Promise.resolve()
  list.value = options
  await flush()
  expect(view.container.querySelector('select')!.value).toBe('c')
})

test('a value not in the options shows the placeholder, not a blank', async () => {
  const view = render(() => <Select label="Pick" placeholder="Choose" options={options} value="nope" />)
  await Promise.resolve()
  const select = view.container.querySelector('select')!
  expect(select.selectedIndex).toBe(0)
  expect(select.selectedOptions[0].textContent).toBe('Choose')
})

test('clearing the value goes back to the first option', async () => {
  const value = state<string | undefined>('c')
  const view = render(() => <Select label="Pick" options={options} value={value.value} />)
  await Promise.resolve()
  value.value = undefined
  await flush()
  expect(view.container.querySelector('select')!.selectedIndex).toBe(0)
})

describe.each([['no value', undefined, 'c'], ['a value', 'c', 'a']])('a pick before hydration, with %s', (_, value, pick) => {
  test('stays, and the page hears of it', async () => {
    resetIds()
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = renderToString(() => server({ value }))
    const select = root.querySelector('select')!
    select.value = pick
    const heard: string[] = []
    root.addEventListener('change', () => heard.push(select.value))
    resetIds()
    const dispose = hydrate(() => client({ value }), root)
    await flush()
    await Promise.resolve()
    expect(select.value).toBe(pick)
    expect(heard).toEqual([pick])
    dispose()
    root.remove()
  })
})

test('nothing is heard when no one picked', async () => {
  for (const value of [undefined, 'c']) {
    resetIds()
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = renderToString(() => server({ value }))
    const heard: string[] = []
    root.addEventListener('change', e => heard.push((e.target as HTMLSelectElement).value))
    resetIds()
    const dispose = hydrate(() => client({ value }), root)
    await flush()
    await Promise.resolve()
    expect(heard).toEqual([])
    dispose()
    root.remove()
  }
  const heard: string[] = []
  const view = render(() => <div onChange={(e: any) => heard.push(e.target.value)}><Select label="Pick" options={options} value="c" /></div>)
  await Promise.resolve()
  expect(view.container.querySelector('select')!.value).toBe('c')
  expect(heard).toEqual([])
})

test('Grid takes a step or a length', () => {
  const step = render(() => <Grid min="sm" />).container.firstElementChild!
  expect(step.getAttribute('data-min')).toBe('sm')
  expect(step.getAttribute('style')).toBeNull()
  const length = render(() => <Grid min="12rem" />).container.firstElementChild!
  expect(length.getAttribute('data-min')).toBeNull()
  expect((length as HTMLElement).style.getPropertyValue('--_min').trim()).toBe('12rem')
})
