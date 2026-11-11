import { fireEvent } from '@testing-library/dom'
import { flush, render } from '@kerf-js/core/test'
import { Toaster } from '../../src/Toast'
import { Kanban, type KanbanColumn } from '../../src/collab/Kanban'
import { wait } from '../timers.mjs'
import { button, polite, q, qa, tick } from './support'

function suiteContext() {
  const data = (): KanbanColumn[] => [
    {
      id: 'a',
      title: 'To do',
      cards: [
        { id: '1', title: 'One' },
        { id: '2', title: 'Two' },
      ],
    },
    {
      id: 'b',
      title: 'Doing',
      limit: 1,
      cards: [
        { id: '3', title: 'Three' },
        { id: '4', title: 'Four' },
      ],
    },
  ]
  const mount = () => {
    const moves: unknown[] = []
    const { container: c } = render(() => (
      <>
        <Kanban columns={data()} onMove={(id, col, i) => moves.push([id, col, i])} />
        <Toaster />
      </>
    ))
    const titles = () =>
      qa(c, '[data-part="column"]').map((col) =>
        qa(col, '[data-part="row"]')
          .sort(
            (a, b) =>
              Number(a.getAttribute('aria-posinset')) - Number(b.getAttribute('aria-posinset')),
          )
          .map((r) => r.querySelector('h4')!.textContent),
      )
    const card = (id: string) => q(c, `[data-part="card"][data-id="${id}"]`)
    return { c, moves, titles, card }
  }
  return { data, mount }
}

function registerSectionsOfOrderedListsCount(ctx: ReturnType<typeof suiteContext>) {
  const { mount } = ctx
  test('sections of ordered lists, count and limit, caution when over', async () => {
    const { c } = mount()
    await tick()
    const cols = qa(c, 'section[data-part="column"]')
    expect(cols.length).toBe(2)
    expect(q(cols[1]!, '[data-part="count"]').textContent).toBe('2 / 1')
    expect(cols[1]!.hasAttribute('data-over-limit')).toBe(true)
    expect(cols[0]!.hasAttribute('data-over-limit')).toBe(false)
    expect(q(cols[0]!, 'ol li [data-part="card"]').getAttribute('draggable')).toBe('true')
  })
  test('Alt + arrows move and announce; the same node reorders; focus follows across columns', async () => {
    const { card, titles, moves } = mount()
    await tick()
    const one = card('1')
    one.focus()
    fireEvent.keyDown(one, { key: 'ArrowDown', altKey: true })
    await tick()
    expect(titles()[0]).toEqual(['Two', 'One'])
    expect(card('1')).toBe(one)
    expect(document.activeElement).toBe(one)
    await wait()
    expect(polite()).toBe('Moved One to To do, position 2 of 2')
    fireEvent.keyDown(one, { key: 'ArrowRight', altKey: true })
    await tick()
    expect(titles()).toEqual([['Two'], ['Three', 'One', 'Four']])
    expect(document.activeElement).toBe(card('1'))
    expect(moves.at(-1)).toEqual(['1', 'b', 1])
    await wait()
    expect(polite()).toBe('Moved One to Doing, position 2 of 3')
  })
  test('Space lifts, arrows carry, Space drops; Escape puts it back', async () => {
    const { card, titles } = mount()
    await tick()
    card('1').focus()
    fireEvent.keyDown(card('1'), { key: ' ' })
    expect(card('1').hasAttribute('data-dragging')).toBe(true)
    await wait()
    expect(polite()).toContain('Picked up One')
    fireEvent.keyDown(card('1'), { key: 'ArrowRight' })
    await tick()
    expect(titles()[1]).toContain('One')
    expect(card('1').hasAttribute('data-dragging')).toBe(true)
    fireEvent.keyDown(card('1'), { key: ' ' })
    expect(card('1').hasAttribute('data-dragging')).toBe(false)
    fireEvent.keyDown(card('1'), { key: ' ' })
    fireEvent.keyDown(card('1'), { key: 'ArrowDown' })
    await tick()
    fireEvent.keyDown(card('1'), { key: 'Escape' })
    await tick()
    expect(titles()[1]!.indexOf('One')).toBe(0)
    expect(card('1').hasAttribute('data-dragging')).toBe(false)
  })
}

function registerTheMoveMenuListsEach(ctx: ReturnType<typeof suiteContext>) {
  const { mount, data } = ctx
  test('the Move menu lists each column, the current one disabled, and moves', async () => {
    const { c, card, titles } = mount()
    await tick()
    q(card('1'), '[data-part="move"]').click()
    await flush()
    await tick()
    const items = qa(card('1'), '[role="menuitem"]')
    expect(items.map((i) => i.textContent)).toEqual([
      'Move to To do',
      'Move to Doing',
      'Move up',
      'Move down',
    ])
    expect(items[0]!.getAttribute('aria-disabled')).toBe('true')
    items[1]!.click()
    await flush()
    await wait(20)
    expect(titles()[1]).toEqual(['Three', 'Four', 'One'])
    expect(document.activeElement).toBe(q(c, '[data-id="1"]'))
  })
  test('on a phone Move opens a sheet', async () => {
    const spy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390)
    const { c, card, titles } = mount()
    await tick()
    q(card('1'), '[data-part="move"]').click()
    await flush()
    await tick()
    expect(q(c, 'dialog[data-scope="sheet"]').textContent).toContain('Move One')
    expect(card('1').querySelector('[role="menuitem"]')).toBeNull()
    button(q(c, 'dialog'), 'Move to Doing').click()
    await flush()
    await wait(20)
    expect(titles()[1]).toEqual(['Three', 'Four', 'One'])
    spy.mockRestore()
  })
  test('a drag drops into the column under it', async () => {
    const { c, card, titles } = mount()
    await tick()
    const dt = { setData() {}, effectAllowed: '' }
    fireEvent.dragStart(card('1'), { dataTransfer: dt })
    const col = qa(c, '[data-part="column"]')[1]
    fireEvent.dragOver(q(col!, 'ol'), { dataTransfer: dt, clientY: 0 })
    expect(col!.hasAttribute('data-drop')).toBe(true)
    expect(q(col!, '[data-part="placeholder"]')).toBeTruthy()
    fireEvent.drop(q(col!, 'ol'), { dataTransfer: dt })
    fireEvent.dragEnd(card('1'))
    await flush()
    expect(titles()[1]).toContain('One')
    expect(c.querySelector('[data-part="placeholder"]')).toBeNull()
    expect(col!.hasAttribute('data-drop')).toBe(false)
  })
  test('quick add calls out with the column', async () => {
    const added: string[][] = []
    const { container: c } = render(() => (
      <Kanban columns={data()} onAdd={(col, t) => added.push([col, t])} />
    ))
    button(c, 'Add card').click()
    await flush()
    const input = q<HTMLInputElement>(c, 'form input')
    input.value = 'New'
    fireEvent.submit(q(c, 'form'))
    expect(added).toEqual([['a', 'New']])
  })
}

export function registerKanban() {
  describe('Kanban', () => {
    const ctx = suiteContext()
    registerSectionsOfOrderedListsCount(ctx)
    registerTheMoveMenuListsEach(ctx)
  })
}
