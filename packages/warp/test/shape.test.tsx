// <Shape> as a <Boundary pending> (research 26 §4): the spec's Skeleton parts in a busy, inert SkeletonScope, with
// the counts it was given, replaced by the content when the data lands.
// weft-allow T004: fake timers drive the Boundary's 150 ms / 400 ms timing
import { screen } from '@testing-library/dom'
import axe from 'axe-core'
import { Boundary, resource } from '@weft-js/core'
import { flush, render } from '@weft-js/core/test'
import { Shape } from '../src/Shape'
import '../src/skeleton-css'

function Feed() {
  const posts = resource(
    () =>
      new Promise<{ id: number; title: string }[]>((ok) => {
        setTimeout(
          () =>
            ok([
              { id: 1, title: 'One' },
              { id: 2, title: 'Two' },
            ]),
          300,
        )
      }),
  )
  return (
    <ul>
      {(posts.value ?? []).map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

test('a list shape: one avatar and two lines per row, busy and inert, then the content', async () => {
  render(() => (
    <Boundary pending={<Shape kind="list" rows={2} label="Loading posts" />}>
      <Feed />
    </Boundary>
  ))
  await vi.advanceTimersByTimeAsync(150)
  const region = screen.getByRole('status', { name: 'Loading posts' })
  expect(region.getAttribute('aria-busy')).toBe('true')
  expect(region.hasAttribute('inert')).toBe(true)
  const shapes = [...region.querySelectorAll('[data-scope="skeleton"]')].map(
    (s) => s.getAttribute('data-shape') ?? 'text',
  )
  expect(shapes).toEqual(['circle', 'text', 'text', 'circle', 'text', 'text'])

  await vi.advanceTimersByTimeAsync(400)
  await flush()
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['One', 'Two'])
})

test('pending="shape": a compiled variant in the same SkeletonScope, and it passes axe', async () => {
  render(() => (
    <Boundary pending="shape">
      <Feed />
    </Boundary>
  ))
  await vi.advanceTimersByTimeAsync(150)
  const region = screen.getByRole('status', { name: 'Loading' })
  expect(region.getAttribute('data-scope')).toBe('skeleton-scope')
  expect(region.querySelectorAll('[data-skeleton]').length).toBeGreaterThan(0)
  vi.useRealTimers()
  expect((await axe.run(document.body)).violations).toEqual([])
})

test('every shape passes axe', async () => {
  vi.useRealTimers()
  render(() => (
    <div>
      <Shape kind="card" media="4/3" />
      <Shape kind="table" rows={2} cols={3} label="Loading orders" />
      <Shape kind="media" />
    </div>
  ))
  expect((await axe.run(document.body)).violations).toEqual([])
})
