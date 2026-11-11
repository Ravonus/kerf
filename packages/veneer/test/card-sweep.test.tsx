// Card's sweep is opt-in (SIGNATURE §3): by default, pressable or not, it only carries the flair marker.
import { render } from '@kerf-js/core/test'
import { Card } from '../src/Card'

const attr = (c: Element) => {
  const host = c.querySelector('[data-scope="surface"]')!
  return {
    sweep: host.getAttribute('data-sweep'),
    part: !!host.querySelector(':scope > [data-part="sweep"]'),
  }
}

test.each([
  ['static', () => <Card title="A" />],
  ['link', () => <Card href="#a" title="A" />],
  ['button', () => <Card onClick={() => {}} title="A" />],
])('a %s card does not sweep by default: only data-flair="sweep" shows it', (_, view) => {
  expect(attr(render(view).container)).toEqual({ sweep: 'surface', part: true })
})

test.each([
  ['static', () => <Card sweep title="A" />],
  ['link', () => <Card sweep href="#a" title="A" />],
  ['button', () => <Card sweep onClick={() => {}} title="A" />],
])('a %s card with `sweep` opts in', (_, view) => {
  expect(attr(render(view).container)).toEqual({ sweep: '', part: true })
})

test('sweep={false} leaves the parts out altogether', () => {
  expect(attr(render(() => <Card sweep={false} title="A" />).container)).toEqual({
    sweep: null,
    part: false,
  })
})
