import { flush, render } from '@kerf-js/core/test'
import * as C from '.././fixtures/Surfaces'
import { key, type } from './support'

function suiteContext() {
  const opened = async () => {
    const r = render(() => <C.PaletteCase />)
    r.container.querySelector('button')!.click()
    await flush()
    return Object.assign(document.querySelector<HTMLInputElement>('[role="combobox"]')!, {
      box: r.container,
    })
  }
  return { opened }
}

function registerFiltersByFuzzyLettersAnd(ctx: ReturnType<typeof suiteContext>) {
  const { opened } = ctx
  test('filters by fuzzy letters and keywords, and Enter runs the active row', async () => {
    const input = await opened()
    const c = input.box
    type(input, 'teammate')
    await flush()
    expect([...c.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual([
      expect.stringContaining('Invite member'),
    ])
    key(input, 'Enter')
    await flush()
    expect(c.querySelector('[data-out]')!.textContent).toBe('inv')
  })
  test("a narrowing query redraws the row's label, not adds to it", async () => {
    const input = await opened()
    type(input, 'se')
    await flush()
    type(input, 'set')
    await flush()
    expect(document.querySelector('[role="option"]')!.textContent).toContain('Settings')
    expect(document.querySelector('[role="option"]')!.textContent).not.toContain('Settingst')
  })
}

function registerOpeningANestedRowStarts() {
  test('opening a nested row starts its level with an empty query, typing filters that level, and leaving clears it again', async () => {
    const r = render(() => <C.PaletteNested />)
    r.container.querySelector('button')!.click()
    await flush()
    const input = document.querySelector<HTMLInputElement>('[role="combobox"]')!
    const labels = () =>
      [...document.querySelectorAll('[role="option"]')]
        .filter((o) => !(o as HTMLElement).hidden)
        .map((o) => o.textContent)
    type(input, 'Move')
    await flush()
    expect(labels()).toEqual([expect.stringContaining('Move to')])
    key(input, 'Enter') // no run: opens its children
    await flush()
    expect(input.value).toBe('')
    expect(labels()).toEqual(['Inbox', 'Archive', 'us-east', 'us-west'])
    type(input, 'us-ea') // was "Moveus-ea", searching the top level
    await flush()
    expect(input.value).toBe('us-ea')
    expect(labels()).toEqual(['us-east'])
    key(input, 'Escape') // clears the query, stays in the level
    await flush()
    expect(input.value).toBe('')
    expect(labels()).toHaveLength(4)
    expect(input.closest('dialog')!.hasAttribute('open')).toBe(true)
    type(input, 'arch')
    await flush()
    type(input, 'arch', 0)
    key(input, 'ArrowLeft') // at the query's start: back to the top, with the query cleared
    await flush()
    expect(input.value).toBe('')
    expect(labels()).toEqual([
      expect.stringContaining('Move to'),
      expect.stringContaining('Settings'),
    ])
    type(input, 'Move')
    await flush()
    key(input, 'ArrowRight')
    await flush()
    expect(input.value).toBe('')
    expect(labels()).toHaveLength(4)
    key(input, 'Escape') // an empty query in a level goes back up
    await flush()
    expect(labels()).toHaveLength(2)
    expect(input.closest('dialog')!.hasAttribute('open')).toBe(true)
    key(input, 'Escape') // the top level with nothing typed: now it closes
    await flush()
    expect(input.closest('dialog')!.hasAttribute('open')).toBe(false)
  })
}

function registerANestedLevelNamesItself(ctx: ReturnType<typeof suiteContext>) {
  const { opened } = ctx
  test('a nested level names itself before the query, and the name goes when you leave it', async () => {
    const r = render(() => <C.PaletteRegions />)
    r.container.querySelector('button')!.click()
    await flush()
    const input = document.querySelector<HTMLInputElement>('[role="combobox"]')!
    const crumb = () => input.parentElement!.querySelector<HTMLElement>('[data-part="crumb"]')
    expect(crumb()).toBeNull()
    type(input, 'Move')
    await flush()
    key(input, 'Enter')
    await flush()
    expect(crumb()!.textContent).toBe('Region›')
    expect(input.placeholder).toBe('Search Region…')
    expect(document.querySelector(`label[for="${input.id}"]`)!.textContent).toContain('Region')
    crumb()!.click() // the chip goes back up
    await flush()
    expect(crumb()).toBeNull()
    type(input, 'Tag')
    await flush()
    key(input, 'Enter')
    await flush()
    expect(crumb()!.textContent).toBe('Tag release›') // no title: the row's label
  })
  test('"us" finds the us regions, not eu-west\'s scattered letters', async () => {
    const r = render(() => <C.PaletteRegions />)
    r.container.querySelector('button')!.click()
    await flush()
    const input = document.querySelector<HTMLInputElement>('[role="combobox"]')!
    const labels = () =>
      [...document.querySelectorAll('[role="option"]')]
        .filter((o) => !(o as HTMLElement).hidden)
        .map((o) => o.textContent)
    type(input, 'Move')
    await flush()
    key(input, 'Enter')
    await flush()
    type(input, 'us')
    await flush()
    expect(labels()).toEqual(['us-east', 'us-west'])
    type(input, 'west')
    await flush()
    expect(labels()).toEqual(['eu-west', 'us-west'])
  })
  test("Esc clears a typed query first and keeps the palette open; the next Esc closes it, and the dialog's own cancel steps back the same way", async () => {
    const input = await opened()
    const dlg = input.closest('dialog')!
    type(input, 'Dep')
    await flush()
    key(input, 'Escape')
    await flush()
    expect(input.value).toBe('')
    expect(dlg.hasAttribute('open')).toBe(true)
    type(input, 'Dep')
    await flush()
    await new Promise((r) => {
      setTimeout(r, 100)
    }) // past the layer stack's Escape window: a cancel on its own (a back gesture)
    dlg.dispatchEvent(new Event('cancel', { cancelable: true }))
    await flush()
    expect(input.value).toBe('')
    expect(dlg.hasAttribute('open')).toBe(true)
    key(input, 'Escape')
    await flush()
    expect(dlg.hasAttribute('open')).toBe(false)
  })
}

function registerTheArrowsWrapAndThe(ctx: ReturnType<typeof suiteContext>) {
  const { opened } = ctx
  test('the arrows wrap and the input keeps focus through aria-activedescendant', async () => {
    const input = await opened()
    const list = () => input.getAttribute('aria-activedescendant')
    const first = list()
    key(input, 'ArrowUp')
    await flush()
    expect(list()).not.toBe(first)
    key(input, 'ArrowDown')
    await flush()
    expect(list()).toBe(first)
  })
}

export function registerCommandPalette() {
  describe('CommandPalette', () => {
    const ctx = suiteContext()
    registerFiltersByFuzzyLettersAnd(ctx)
    registerOpeningANestedRowStarts()
    registerANestedLevelNamesItself(ctx)
    registerTheArrowsWrapAndThe(ctx)
  })
}
