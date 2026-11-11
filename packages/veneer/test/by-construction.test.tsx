// What an agent composing veneer gets right without knowing to: the defects a rendered audit (kerf audit, axe-core) found
// in pages built from veneer, held at the component. The rendered half is in flow-scroll.browser.test.ts.
import { render } from '@kerf-js/core/test'
import { Accordion, ActivityFeed, Button, Kbd, Table } from '../src/index'

describe('a button that collapses to its icon keeps its text as its name', () => {
  it('wraps the text so CSS can hide it from the eye only, and says under which form factor', () => {
    const { container } = render(() => (
      <Button icon="search" collapse="tablet">
        Search
        <span aria-hidden="true">
          <Kbd>K</Kbd>
        </span>
      </Button>
    ))
    const b = container.querySelector('button')!
    expect(b.dataset.collapse).toBe('tablet')
    expect(b.querySelector('[data-part="collapse"]')!.textContent).toBe('SearchK')
    expect(b.hasAttribute('aria-label')).toBe(false) // the name is the text: nothing a breakpoint can take away
    expect(b.hasAttribute('data-icon-only')).toBe(false)
  })

  it('does nothing without an icon to fall back on, or without text to keep', () => {
    const text = render(() => <Button collapse="phone">Save</Button>).container.querySelector(
      'button',
    )!
    expect([
      text.hasAttribute('data-collapse'),
      text.querySelector('[data-part="collapse"]'),
    ]).toEqual([false, null])
    const icon = render(() => (
      <Button icon="search" label="Search" collapse="phone" />
    )).container.querySelector('button')!
    expect([icon.hasAttribute('data-collapse'), icon.hasAttribute('data-icon-only')]).toEqual([
      false,
      true,
    ])
  })
})

describe('a table that scrolls can be scrolled from the keyboard', () => {
  it('makes its viewport a focusable region named by the caption', () => {
    const { container } = render(() => (
      <Table
        caption="Speed"
        rows={[{ id: '1', name: 'a' }]}
        columns={[{ id: 'name', header: 'Name', cell: (r: { name: string }) => r.name }]}
      />
    ))
    const viewport = container.querySelector('[data-part="viewport"]')!
    expect([viewport.getAttribute('tabindex'), viewport.getAttribute('role')]).toEqual([
      '0',
      'region',
    ])
    expect(
      container.querySelector(`#${viewport.getAttribute('aria-labelledby')}`)!.textContent,
    ).toBe('Speed')
  })
})

describe('a titled part takes the level of where it sits', () => {
  it('is an h3 in a page section, and says another level when placed elsewhere', () => {
    const feed = (level?: 2) =>
      render(() =>
        level ? <ActivityFeed items={[]} level={level} /> : <ActivityFeed items={[]} />,
      ).container.querySelector('h3')!
    expect([feed().getAttribute('aria-level'), feed(2).getAttribute('aria-level')]).toEqual([
      null,
      '2',
    ])
    const acc = render(() => (
      <Accordion level={2} items={[{ value: 'a', title: 'A', content: 'x' }]} />
    )).container.querySelector('[role="heading"]')!
    expect(acc.getAttribute('aria-level')).toBe('2')
  })
})
