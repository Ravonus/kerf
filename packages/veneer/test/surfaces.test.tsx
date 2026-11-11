// DataGrid, the pagination bar, the palette, mentions, code and the editors: keyboard, ARIA, SSR + hydration.
import { registerCommandPalette } from './surfaces/command-palette'
import { key, out, type } from './surfaces/support'
import { hydrate } from '@kerf/core/dom'
import { renderToString } from '@kerf/core/ssr'
import { flush, render } from '@kerf/core/test'
import { resetIds } from '@kerf/veneer-core'
import { sleep as tick } from '../../../scripts/lib/sleep.mjs'
import { hydration } from '../../core/src/hydrate'
import * as C from './fixtures/Surfaces'
// @ts-expect-error: query imports (@kerf/core/vite)
const server = await import('./fixtures/Surfaces.tsx?kerf-ssr')
// @ts-expect-error: query imports (@kerf/core/vite)
const client = await import('./fixtures/Surfaces.tsx?kerf-hydrate')

test.each(Object.keys(client).filter((n) => n.endsWith('Case')))(
  '%s: SSR + hydrate, 0 misses, 0 writes',
  (name) => {
    resetIds()
    const html = renderToString(() => server[name]())
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = html
    const writes: MutationRecord[] = []
    const observer = new MutationObserver((r) => writes.push(...r))
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    resetIds()
    const dispose = hydrate(() => client[name](), root)
    writes.push(...observer.takeRecords())
    observer.disconnect()
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
    expect(hydration.misses).toBe(0)
    expect(writes).toEqual([])
    dispose()
    root.remove()
  },
)

test("a textarea's text is in the server HTML", () => {
  for (const name of ['MentionsCase', 'CodeCase', 'MarkdownEditorCase']) {
    const root = document.createElement('div')
    root.innerHTML = renderToString(() => server[name]())
    expect(root.querySelector('textarea')!.value, name).not.toBe('')
  }
})

test('hidden columns are hidden in the server HTML, before any script', () => {
  const html = renderToString(() => server.HiddenColumnsCase())
  expect(html).toMatch(/<style[^>]*data-part="hide"[^>]*>[^<]*display:\s*none/)
})

describe('DataGrid', () => {
  test('a grid with one tab stop; arrows move the cell', async () => {
    const { container: c } = render(() => <C.GridCase />)
    await tick()
    const table = c.querySelector('table')!
    expect(table.getAttribute('role')).toBe('grid')
    const stops = c.querySelectorAll('tbody [tabindex="0"]')
    expect(stops).toHaveLength(1)
    const first = stops[0] as HTMLElement
    first.focus()
    key(first, 'ArrowRight')
    await flush()
    expect(document.activeElement).not.toBe(first)
    expect(c.querySelectorAll('tbody [tabindex="0"]')).toHaveLength(1)
  })
  test('a tree opens with ArrowRight and says its level', async () => {
    const { container: c } = render(() => <C.TreeGridCase />)
    await tick()
    expect(c.querySelector('table')!.getAttribute('role')).toBe('treegrid')
    const row = c.querySelector<HTMLElement>('tbody tr[aria-level="1"]')!
    expect(row.getAttribute('aria-expanded')).toBe('false')
    row.focus()
    key(row, 'ArrowRight')
    await flush()
    await tick()
    await flush()
    expect(c.querySelector('tbody tr[aria-level="1"]')!.getAttribute('aria-expanded')).toBe('true')
    expect(c.querySelector('tbody tr[aria-level="2"]')!.textContent).toContain('Kid')
    expect(c.querySelector('tfoot')!.textContent).toContain('1 row')
    expect(c.querySelector('tfoot')!.textContent).toContain('2')
  })
  test('a pivot totals both ways', () => {
    const { container: c } = render(() => <C.PivotCase />)
    expect(c.textContent).toContain('35')
    expect(c.textContent).toContain('Core')
  })
})

describe('PaginationBar', () => {
  test('the current page is marked, and a press moves it', async () => {
    const { container: c } = render(() => <C.PagesCase />)
    expect(c.querySelector('nav')!.getAttribute('aria-label')).toBe('Projects')
    expect(c.querySelector('[aria-current="page"]')!.textContent).toBe('3')
    ;[...c.querySelectorAll('button')].find((b) => b.textContent === '4')!.click()
    await flush()
    expect(out(c)).toBe('4')
    expect(c.querySelector('[aria-current="page"]')!.textContent).toBe('4')
  })
})

registerCommandPalette()

describe('MentionsInput', () => {
  test('shows the name and keeps the token', () => {
    const { container: c } = render(() => <C.MentionsCase />)
    expect(c.querySelector('textarea')!.value).toBe('Ask @Ada Lovelace ')
    expect(out(c)).toBe('Ask @[Ada Lovelace](user:ada) ')
  })
  test('@ opens the list; Enter inserts a token and announces it', async () => {
    const { container: c } = render(() => <C.MentionsCase />)
    await tick()
    const area = c.querySelector('textarea')!
    type(area, 'Ask @Ada Lovelace @al')
    await flush()
    await new Promise((r) => {
      setTimeout(r, 150)
    })
    await flush()
    expect(area.getAttribute('aria-activedescendant')).toBeTruthy()
    key(area, 'Enter')
    await flush()
    expect(out(c)).toBe('Ask @[Ada Lovelace](user:ada) @[Alan Turing](user:alan) ')
    expect(c.querySelector('[role="status"]')!.textContent).toContain('Alan Turing')
  })
  test('editing inside a name turns it back into text', async () => {
    const { container: c } = render(() => <C.MentionsCase />)
    type(c.querySelector('textarea')!, 'Ask @Ad Lovelace ', 7)
    await flush()
    expect(out(c)).toBe('Ask @Ad Lovelace ')
  })
})

describe('CodeInput', () => {
  test('Tab indents, Shift+Tab outdents', async () => {
    const { container: c } = render(() => <C.CodeCase />)
    const area = c.querySelector('textarea')!
    area.setSelectionRange(0, 0)
    key(area, 'Tab')
    await flush()
    expect(out(c)).toBe('  const a = 1\n')
    key(area, 'Tab', { shiftKey: true })
    await flush()
    expect(out(c)).toBe('const a = 1\n')
  })
  test('Esc then Tab leaves the field', () => {
    const { container: c } = render(() => <C.CodeCase />)
    const area = c.querySelector('textarea')!
    key(area, 'Escape')
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    area.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(false)
  })
  test('the gutter is hidden from assistive tech and counts lines', () => {
    const { container: c } = render(() => <C.CodeCase />)
    const lines = c.querySelector('[data-part="lines"]')!
    expect(lines.getAttribute('aria-hidden')).toBe('true')
    expect(lines.children).toHaveLength(2)
  })
})

describe('KeyValueEditor', () => {
  test('rows edit and add, and every input is named', async () => {
    const { container: c } = render(() => <C.KeyValueCase />)
    const inputs = () => [...c.querySelectorAll<HTMLInputElement>('[data-scope="kv"] input')]
    for (const i of inputs()) expect(i.getAttribute('aria-label') ?? i.labels?.length).toBeTruthy()
    type(inputs()[1]!, 'us')
    await flush()
    expect(JSON.parse(out(c))).toEqual([{ key: 'REGION', value: 'us' }])
    c.querySelector<HTMLElement>('[data-part="add"]')!.click()
    await flush()
    expect(inputs()).toHaveLength(4)
  })
})

describe('RichTextEditor', () => {
  test('a named textbox behind a one-stop toolbar', async () => {
    const { container: c } = render(() => <C.RteCase />)
    await tick()
    const content = c.querySelector<HTMLElement>('[data-part="content"][role="textbox"]')!
    expect(content.getAttribute('role')).toBe('textbox')
    expect(content.getAttribute('aria-multiline')).toBe('true')
    expect(
      document.getElementById(content.getAttribute('aria-labelledby')!)?.textContent,
    ).toContain('Notes')
    const bar = c.querySelector<HTMLElement>('[role="toolbar"]')!
    expect(bar.querySelectorAll('[tabindex="0"]')).toHaveLength(1)
    const first = bar.querySelector<HTMLElement>('[tabindex="0"]')!
    first.focus()
    key(first, 'ArrowRight')
    await flush()
    expect(document.activeElement).not.toBe(first)
    expect(bar.querySelectorAll('[tabindex="0"]')).toHaveLength(1)
  })
  test('what enters from a value is sanitized', () => {
    const { container: c } = render(() => <C.RteCase />)
    expect(c.querySelector('[data-part="content"][role="textbox"]')!.innerHTML).toBe(
      '<p>Hello <strong>world</strong></p>',
    )
  })
  test('markdown format renders into the editor', () => {
    const { container: c } = render(() => <C.RteMarkdownCase />)
    expect(c.querySelector('[data-part="content"] h1, [data-part="content"] h2')!.textContent).toBe(
      'Title',
    )
  })
})

describe('Markdown', () => {
  test('raw HTML is text', () => {
    const { container: c } = render(() => <C.MarkdownCase />)
    expect(c.querySelector('script')).toBeNull()
    expect(c.textContent).toContain('<script>x</script>')
    expect(c.querySelector('strong')!.textContent).toBe('bold')
  })
  test('the preview follows the source, and the tabs are a tablist', async () => {
    const { container: c } = render(() => <C.MarkdownEditorCase />)
    expect(c.querySelector('[role="tablist"]')).toBeTruthy()
    type(c.querySelector('textarea')!, '**x**')
    await flush()
    expect(out(c)).toBe('**x**')
    expect(c.querySelector('[data-scope="markdown"] strong')!.textContent).toBe('x')
  })
})
