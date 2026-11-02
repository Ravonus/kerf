// React prop names on native elements: the same DOM from a literal, a dynamic value and a spread, in a client render,
// a server render and hydration. Docs: docs/react-props.md.
// weft-allow T005, T008: framework test of attribute names; markup is the subject, and each loop walks a fixed list of props
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { renderToString } from '@weft-js/core/ssr'
import { flush } from '@weft-js/core/test'
import { attrName, hydrate, render } from '@weft-js/core/dom'
import { hydration } from '../src/hydrate'
import * as Dom from './fixtures/react-props/Props.tsx'
import * as Server from './fixtures/react-props/Props.tsx?weft-ssr'
import * as Client from './fixtures/react-props/Props.tsx?weft-hydrate'
import { Control, Defaults, Direct, Focused, InClosedDialog, Spread as SpreadEvents, Swapped } from './fixtures/react-props/Events.tsx'

type Name = keyof typeof Dom

const mount = () => document.body.appendChild(document.createElement('div'))
afterEach(() => { document.body.textContent = '' })

function client(name: Name) {
  const root = mount()
  render(() => Dom[name]({}), root)
  return root
}
const html = (name: Name) => renderToString(() => Server[name]({}))
function server(name: Name) {
  const root = mount()
  root.innerHTML = html(name)
  return root
}
function hydrated(name: Name) {
  const root = server(name)
  const before = root.innerHTML
  hydrate(() => Client[name]({}), root)
  expect(hydration.misses).toBe(0)
  expect(root.innerHTML).toBe(before) // hydration adopts what the server wrote and wipes nothing
  return root
}

const modes = { client, server, hydrated }
const q = <T extends Element = HTMLInputElement>(root: Element, css: string) => root.querySelector(css) as unknown as T

describe.each(['Literal', 'Dynamic', 'Spread'] as const)('HTML, %s', name => {
  describe.each(Object.keys(modes) as (keyof typeof modes)[])('%s', mode => {
    const root = () => modes[mode](name)

    test('camelCase names reach their attributes', () => {
      const r = root()
      const text = q(r, '[data-kind=text]')
      expect(text.getAttribute('tabindex')).toBe('3')
      expect(text.hasAttribute('readonly')).toBe(true)
      expect(text.getAttribute('maxlength')).toBe('5')
      expect(text.getAttribute('autocomplete')).toBe('off')
      const td = q(r, 'td')
      expect([td.getAttribute('colspan'), td.getAttribute('rowspan')]).toEqual(['2', '3'])
      const img = q(r, 'img')
      expect([img.getAttribute('crossorigin'), img.getAttribute('srcset')]).toEqual(['anonymous', 'a.png 2x'])
      expect(q(r, 'form').getAttribute('accept-charset')).toBe('utf-8')
      expect(q(r, 'meta').getAttribute('http-equiv')).toBe('refresh')
    })

    test('`false` is a word where `false` is a state', () => {
      const r = root()
      expect(q(r, '[data-kind=text]').getAttribute('spellcheck')).toBe('false')
      expect(q(r, '[data-kind=edit]').getAttribute('contenteditable')).toBe('false')
      const b = q(r, 'button')
      expect(['aria-pressed', 'aria-label', 'data-n'].map(a => b.getAttribute(a))).toEqual(['false', 'hi', '2'])
      // Deliberately not React's: a data flag is present or absent (docs/react-props.md).
      expect([b.getAttribute('data-active'), b.getAttribute('data-on')]).toEqual([null, ''])
    })

    test('defaults and values start the form', () => {
      const r = root()
      expect(q(r, '[data-kind=text]').value).toBe('hi')
      expect(q(r, '[data-kind=check]').checked).toBe(true)
      expect(q(r, 'textarea[data-kind=dflt]').value).toBe('hi')
      expect(q(r, 'textarea[data-kind=ctl]').value).toBe('hi')
      expect(q(r, 'select:not([data-kind])').value).toBe('b')
      expect(q(r, 'select[data-kind=ctl]').value).toBe('b')
    })

    test('dangerouslySetInnerHTML', () => {
      const raw = q(root(), '[data-kind=raw]')
      expect(raw.innerHTML).toBe('<b>raw</b>')
      expect(raw.hasAttribute('dangerouslysetinnerhtml')).toBe(false)
    })

    test('style: camelCase names, px for numbers, unitless properties, custom properties', () => {
      const { style } = q<HTMLElement>(root(), 'p')
      expect(style.getPropertyValue('font-size')).toBe('12px')
      expect(style.getPropertyValue('z-index')).toBe('2')
      expect(style.getPropertyValue('line-height')).toBe('1.5')
      expect(style.getPropertyValue('background-color')).toBe('red')
      expect(style.getPropertyValue('--gap')).toBe('4')
      expect(style.getPropertyValue('padding')).toBe('1px')
      expect(style.getPropertyValue('color')).toBe('') // `color: cond && 'red'`
    })
  })
})

describe.each(['SvgLiteral', 'SvgDynamic', 'SvgSpread'] as const)('SVG, %s', name => {
  test.each(Object.keys(modes) as (keyof typeof modes)[])('%s', mode => {
    const r = modes[mode](name)
    const svg = q(r, 'svg')
    const path = q(r, 'path')
    expect(path.getAttribute('stroke-width')).toBe('2')
    expect(path.getAttribute('stroke-linecap')).toBe('round')
    expect(path.getAttribute('fill-opacity')).toBe('0.5')
    expect(path.getAttribute('clip-path')).toBe('url(#c)')
    expect(path.getAttributeNames().sort()).toEqual(['clip-path', 'fill-opacity', 'stroke-linecap', 'stroke-width'])
    expect(q(r, 'stop').getAttribute('stop-color')).toBe('red')
    expect(q(r, 'text').getAttribute('text-anchor')).toBe('middle')
    expect(q(r, 'use').getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe('#a')
    expect(svg.getAttribute('viewBox')).toBe('0 0 10 10')
    expect(svg.getAttribute('tabindex')).toBe('0')
    expect(svg.getAttribute('focusable')).toBe('false')
    expect(q(r, 'linearGradient').getAttribute('gradientUnits')).toBe('userSpaceOnUse')
  })
})

describe.each([['written', Direct], ['spread', SpreadEvents]] as const)('events, %s', (_, Comp) => {
  function setup() {
    const log: string[] = []
    const root = mount()
    render(() => Comp({ log: w => log.push(w) }), root)
    return { root, log, take: () => log.splice(0) }
  }

  test('onChange fires per keystroke, not again on blur, and leaves onInput alone', async () => {
    const { root, take } = setup()
    const input = q(root, '[data-t=text]')
    await userEvent.type(input, 'ab')
    expect(take().filter(w => w !== 'input')).toEqual(['change:a', 'change:ab'])
    await userEvent.tab()
    expect(take()).toEqual([])
  })

  test('onChange and onInput both fire on one element', async () => {
    const { root, take } = setup()
    await userEvent.type(q(root, '[data-t=text]'), 'a')
    expect(take().sort()).toEqual(['change:a', 'input'])
  })

  test('a change event alone counts (fireEvent.change)', () => {
    const { root, take } = setup()
    fireEvent.change(q(root, '[data-t=text]'), { target: { value: 'x' } })
    expect(take()).toEqual(['change:x'])
  })

  test('a checkbox and a select fire once per edit', async () => {
    const { root, take } = setup()
    await userEvent.click(q(root, '[data-t=box]'))
    expect(take()).toEqual(['change:true'])
    await userEvent.selectOptions(q(root, '[data-t=pick]'), 'b')
    expect(take()).toEqual(['change:b'])
  })

  test('onChange on a form hears its fields per keystroke', async () => {
    const { root, take } = setup()
    await userEvent.type(q(root, '[data-t=inner]'), 'ab')
    expect(take()).toEqual(['form', 'form'])
  })

  test('onDoubleClick', async () => {
    const { root, take } = setup()
    await userEvent.dblClick(q(root, '[data-t=dbl]'))
    expect(take()).toEqual(['double'])
  })

  test('onClickCapture runs first, and onClick still runs', () => {
    const { root, take } = setup()
    q(root, '[data-t=in]').click()
    const log = take()
    expect(log[0]).toBe('capture')
    expect(log.slice(1).sort()).toEqual(['bubble', 'target'])
  })
})

test('a spread onChange that changes replaces the old handler', async () => {
  const log: string[] = []
  const root = mount()
  render(() => Swapped({ log: w => log.push(w) }), root)
  fireEvent.input(q(root, 'input'))
  q(root, 'button').click()
  await flush()
  fireEvent.input(q(root, 'input'))
  expect(log).toEqual(['v1', 'v2'])
})

test('defaultValue never overwrites what the user typed', async () => {
  const root = mount()
  render(() => Defaults({}), root)
  for (const t of ['dflt', 'area', 'spread']) fireEvent.input(q(root, `[data-t=${t}]`), { target: { value: 'typed' } })
  q(root, 'button').click()
  await flush()
  for (const t of ['dflt', 'area', 'spread']) expect(q(root, `[data-t=${t}]`).value).toBe('typed')
})

describe('autoFocus focuses on mount, as React does', () => {
  test('in a closed dialog it waits for showModal, and forces no layout', async () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    render(() => <InClosedDialog />, mount())
    await Promise.resolve()
    expect(focus).not.toHaveBeenCalled()
    focus.mockRestore()
  })

  test.each([[false], [true]])('spread: %s', async spread => {
    const root = mount()
    render(() => Focused({ show: () => true, spread }), root)
    await flush()
    expect(document.activeElement).toBe(q(root, 'input'))
  })
})

describe('negative control', () => {
  test('names outside the tables, kebab-case and undefined values are left alone', () => {
    const log: string[] = []
    const root = mount()
    render(() => Control({ log: w => log.push(w) }), root)
    // case-sensitive SVG attributes survive; a mixed-case unknown is what the HTML parser makes of it, not a table's
    expect(q(root, 'svg').getAttribute('viewBox')).toBe('0 0 1 1')
    expect(q(root, 'svg').getAttribute('foobar')).toBe('1')
    expect(q(root, 'clipPath').getAttribute('clipPathUnits')).toBe('userSpaceOnUse')
    const spread = q(root, 'svg + div')
    expect(spread.getAttributeNames().sort()).toEqual(['foobar', 'z-index'])
    const { style } = q<HTMLElement>(root, 'p')
    expect(style.getPropertyValue('width')).toBe('1px')
    expect(style.getPropertyValue('z-index')).toBe('3')
    expect(style.getPropertyValue('--n')).toBe('2')
    q(root, '[data-t=plain]').click()
    expect(log).toEqual(['click'])
  })

  test('the fixture can fail: a literal attribute outside the table is still lowercased by the parser', () => {
    const t = document.createElement('template')
    t.innerHTML = '<svg><path strokeWidth="2"></path></svg>'
    expect((t.content.querySelector('path') as Element).getAttribute('stroke-width')).toBe(null)
  })
})

describe('the runtime table agrees with the compiler table', () => {
  const rust = readFileSync(join(import.meta.dirname, '../../../crates/weft-compiler/src/react.rs'), 'utf8')
  const list = (name: string) => [...new RegExp(`const ${name}: &\\[&str\\] = &\\[([^\\]]*)\\]`).exec(rust)![1].matchAll(/"(\w+)"/g)].map(m => m[1])

  test('dashed names', () => {
    const dashed = list('DASHED')
    expect(dashed.length).toBeGreaterThan(70)
    // No browser reads these, so only the compiler spells them: a spread keeps them as written.
    const unread = /^(?:accentHeight|arabicForm|capHeight|colorProfile|enableBackground|glyph|horiz|overline|panose1|renderingIntent|strikethrough|underline|unicodeRange|unitsPerEm|vAlphabetic|vHanging|vIdeographic|vMathematical|vert|xHeight)/
    for (const k of dashed) expect(attrName(k)).toBe(unread.test(k) ? k : k.replace(/[A-Z]/g, c => '-' + c.toLowerCase()))
  })

  test('lowered names stay valid on HTML: the element lowercases them itself', () => {
    for (const k of list('LOWERED')) {
      const el = document.createElement('div')
      el.setAttribute(attrName(k), '1')
      expect(el.getAttributeNames()).toEqual([k.toLowerCase()])
    }
  })

  test('case-sensitive SVG attributes are not dashed', () => {
    for (const k of ['viewBox', 'clipPathUnits', 'gradientUnits', 'markerHeight', 'markerUnits', 'markerWidth', 'textLength', 'preserveAspectRatio', 'stdDeviation', 'vAlign'])
      expect(attrName(k)).toBe(k)
  })
})
