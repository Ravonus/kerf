import { state } from '@kerf-js/core'
import { resetIds } from '@kerf-js/veneer-core'
import { hydrate } from '@kerf-js/core/dom'
import { renderToString } from '@kerf-js/core/ssr'
import { flush, render } from '@kerf-js/core/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  Accordion,
  ArtworkFrame,
  Input,
  LockedTile,
  ResultsToolbar,
  SeededPlaceholder,
  StreakIndicator,
} from '../src'
import api from '../api.json' with { type: 'json' }
import pkg from '../package.json' with { type: 'json' }
// @ts-expect-error: kerf compiler query
import { VisualExamples as ServerExamples } from './fixtures/Visuals.tsx?kerf-ssr'
// @ts-expect-error: kerf compiler query
import { VisualExamples as ClientExamples } from './fixtures/Visuals.tsx?kerf-hydrate'

test('the visual examples have server HTML without opening a dialog or painting a canvas', () => {
  resetIds()
  const html = renderToString(ServerExamples)
  const template = document.createElement('template')
  template.innerHTML = html
  for (const name of [
    'artwork-frame',
    'celebration-overlay',
    'locked-tile',
    'particle-burst',
    'particle-field',
    'progressive-picture',
    'results-toolbar',
    'scratch-reveal',
    'section-heading',
    'seeded-placeholder',
    'streak-indicator',
  ])
    expect(template.content.querySelector(`[data-scope="${name}"]`), name).not.toBeNull()
  expect(template.content.querySelector('dialog[open]')).toBeNull()
  expect(template.content.querySelectorAll('canvas')).toHaveLength(3)
  expect(template.content.querySelector('h3')?.textContent).toBe('Report index')
  expect(
    template.content.querySelector('[data-part="scratch-result"]')?.hasAttribute('inert'),
  ).toBe(true)
})

test('the server-rendered gallery accepts a live result update after hydration', async () => {
  const stencil = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  const root = document.body.appendChild(document.createElement('div'))
  resetIds()
  root.innerHTML = renderToString(ServerExamples)
  resetIds()
  const dispose = hydrate(ClientExamples, root)
  try {
    const add = [...root.querySelectorAll('button')].find(
      (node) => node.textContent === 'Add result',
    )
    expect(add).toBeDefined()
    add!.click()
    await flush()
    expect(root.querySelector('[data-part="results-count"]')?.textContent).toBe('1,201 records')
  } finally {
    dispose()
    root.remove()
    stencil.mockRestore()
  }
})

test('placeholder geometry depends on the seed and a missing image has its authored name', () => {
  const { container } = render(() => (
    <>
      <SeededPlaceholder seed="one" />
      <SeededPlaceholder seed="one" />
      <SeededPlaceholder seed="two" accessibleLabel="Third pattern" />
      <ArtworkFrame alt="Named fallback" fallback={<SeededPlaceholder seed="fallback" />} />
    </>
  ))
  const geometry = [...container.querySelectorAll('polygon')].map((node) =>
    node.getAttribute('points'),
  )
  expect(geometry[0]).toBeTruthy()
  expect(geometry[0]).toBe(geometry[1])
  expect(geometry[0]).not.toBe(geometry[2])
  expect(container.querySelector('svg[role="img"]')?.getAttribute('aria-label')).toBe(
    'Third pattern',
  )
  expect(
    container.querySelector('[data-part="artwork-fallback"]')?.getAttribute('aria-label'),
  ).toBe('Named fallback')
})

test('the tile withholds its link and both count treatments respond to live props', async () => {
  const value = state(2)
  const { container } = render(() => (
    <>
      <LockedTile label="Archive" locked={value.value < 3} progress={35}>
        <a href="/archive">Open</a>
      </LockedTile>
      <ResultsToolbar count={value.value} noun="records" announce />
      <StreakIndicator value={value.value} label="Current" thresholds={[3]} reducedMotion />
    </>
  ))
  expect(container.querySelector('a')).toBeNull()
  expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('35')
  value.value = 1100
  await flush()
  expect(container.querySelector('a')?.getAttribute('href')).toBe('/archive')
  expect(container.querySelector('[role="status"]')?.textContent).toBe('1,100 records')
  expect(container.querySelector('[data-part="streak-glow"]')?.hasAttribute('data-active')).toBe(
    true,
  )
})

test('field keeps its extra descriptions, native attributes and decorative label', async () => {
  const { container } = render(() => (
    <Input
      label="Width"
      labelContent={<em>W</em>}
      name="width"
      id="width"
      hint="In centimeters"
      aria-describedby="units"
      attrs={{ class: 'measurement' }}
    />
  ))
  await flush()
  const input = container.querySelector('input')!
  expect(input.name).toBe('width')
  expect(input.getAttribute('aria-describedby')).toBe('units width-msg')
  expect(container.querySelector('[data-part="label-content"]')?.getAttribute('aria-hidden')).toBe(
    'true',
  )
  expect(container.querySelector('.measurement')?.getAttribute('data-scope')).toBe('field')
})

test('controlled accordion reports changes and makes the closed content inert', async () => {
  const current = state<string[]>([])
  const changed = vi.fn<(open: string[]) => void>()
  const { container } = render(() => (
    <Accordion
      open={current.value}
      onChange={changed}
      items={[
        { value: 'a', title: 'A', subtitle: 'Summary', trailing: <b>New</b>, content: 'First' },
      ]}
    />
  ))
  const head = container.querySelector('button')!
  expect(head.textContent).toContain('Summary')
  head.click()
  await flush()
  expect(changed).toHaveBeenCalledWith(['a'])
  expect(container.querySelector('[inert]')).not.toBeNull()
  current.value = ['a']
  await flush()
  expect(head.getAttribute('aria-expanded')).toBe('true')
  expect(container.querySelector('[inert]')).toBeNull()
})

test('the API manifest describes the package exports and names an example for each addition', () => {
  expect(api.exports).toEqual(pkg.exports)
  for (const [name, entry] of Object.entries(api.components)) {
    const markdown = readFileSync(
      resolve(process.cwd(), `../cli/docs/${entry.reference}.md`),
      'utf8',
    )
    expect(markdown).toContain(name)
    expect(markdown).toContain("from '@kerf-js/veneer'")
    expect(markdown).toContain('```tsx')
    for (const prop of 'props' in entry ? entry.props : entry.addedProps)
      expect(markdown, `${name}.${prop}`).toContain(prop.replace('items[].', ''))
  }
})
