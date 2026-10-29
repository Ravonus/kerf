// weft's own back end (research 19, step 1): the same components compiled by Solid's back end (plain imports) and
// by weft's (`?weft-next`) must build the same DOM and react the same way. Comments are left out of the
// comparison (each back end has its own markers), and attribute and class order are normalized.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flush } from 'weft'
import { render } from 'weft/dom'
import * as solid from './fixtures/next/Basics'
// @ts-expect-error: query imports (vite.mjs)
import * as next from './fixtures/next/Basics.tsx?weft-next'
import { Main as SolidBench } from './fixtures/next/Bench'
// @ts-expect-error
import { Main as NextBench } from './fixtures/next/Bench.tsx?weft-next'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { transform } from '../compiler.cjs'

const html = (el: Element) => {
  const copy = el.cloneNode(true) as Element
  const walk = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT)
  const comments: Node[] = []
  while (walk.nextNode()) comments.push(walk.currentNode)
  for (const c of comments) c.remove()
  copy.normalize()
  for (const el of copy.querySelectorAll('*')) {
    const attrs = [...el.attributes].map(a => [a.name, a.name === 'class' ? a.value.split(/\s+/).sort().join(' ') : a.value])
    for (const [n] of attrs) el.removeAttribute(n)
    for (const [n, v] of attrs.sort(([a], [b]) => (a < b ? -1 : 1))) el.setAttribute(n, v)
  }
  return copy.innerHTML
}

let disposers: (() => void)[] = []
const mount = (Comp: () => any) => {
  const root = document.createElement('div')
  document.body.append(root)
  disposers.push(render(() => Comp(), root))
  return root
}
afterEach(() => {
  for (const d of disposers) d()
  disposers = []
  document.body.innerHTML = ''
})

/** Mount both, run each step on both, and compare after every step. */
function same(a: () => any, b: () => any, steps: ((root: Element) => void)[] = []) {
  const ra = mount(a), rb = mount(b)
  expect(html(rb)).toBe(html(ra))
  for (const step of steps) {
    step(ra)
    step(rb)
    flush()
    expect(html(rb)).toBe(html(ra))
  }
  return rb
}
const click = (sel: string) => (root: Element) => (root.querySelector(sel) as HTMLElement).click()

describe('weft back end, step 1', () => {
  it('compiles without Solid-shaped helpers', () => {
    const out = transform(readFileSync(resolve(__dirname, 'fixtures/next/Basics.tsx'), 'utf8'), { filename: 'Basics.tsx', backend: 'weft' })
    expect(out.diagnostics).toEqual([])
    const imported = /import \{([^}]*)\} from "weft\/dom"/.exec(out.code)![1]
    const helpers = ['attr', 'bind', 'child', 'cls', 'component', 'css', 'delegate', 'memo', 'mergeProps', 'on', 'tpl']
    for (const name of imported.split(',').map(s => s.trim().split(' ')[0])) expect(helpers).toContain(name)
    expect(out.code).not.toMatch(/insert|createComponent|template\(|delegateEvents/)
  })

  it('hello', () => {
    expect(html(same(solid.Hello, next.Hello))).toBe('<p>Hello, world</p>')
  })

  it('counter', () => {
    const root = same(solid.Counter, next.Counter, [click('button'), click('button')])
    expect(root.textContent).toBe('2 × 2 = 4')
  })

  it('attributes, class, style, properties, events, text, components, fragments', () => {
    const type = (v: string) => (root: Element) => {
      const input = root.querySelector('input')!
      input.value = v
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const root = same(solid.Panel, next.Panel, [type('Grace'), click('.tone'), click('.wider'), click('button'), click('button')])
    expect(root.querySelector('input')!.value).toBe('Grace')
    expect((root.querySelector('section') as HTMLElement).style.width).toBe('15px')
    expect(root.querySelector('h2')!.title).toBe('a "quoted" title')
  })

  describe('js-framework-benchmark entry', () => {
    let seed = 0
    beforeEach(() => {
      seed = 0
      vi.spyOn(Math, 'random').mockImplementation(() => ((seed = (seed * 9301 + 49297) % 233280) / 233280))
    })
    afterEach(() => vi.restoreAllMocks())

    it('runs the benchmark operations the same way', () => {
      // Each step runs on both apps; reset the random sequence so both draw the same labels.
      const reset = (step: (r: Element) => void) => (r: Element) => { seed = 0; step(r) }
      const root = same(SolidBench, NextBench, [
        reset(click('#run')),
        click('tbody tr:nth-child(5) td:nth-child(2) a'),
        click('#update'),
        click('#swaprows'),
        click('tbody tr:nth-child(3) td:nth-child(3) a'),
        reset(click('#add')),
        click('#clear'),
      ])
      expect(root.querySelectorAll('tbody tr').length).toBe(0)
    })
  })
})

// @ts-expect-error: query import
import * as two from './fixtures/next/Step2.tsx?weft-next'

describe('weft back end, step 2', () => {
  it('conditionals rebuild a branch only when its condition changes', () => {
    const root = mount(two.Toggle)
    const b = root.querySelector('b')!
    ;(root.querySelector('.inc') as HTMLElement).click()
    flush()
    expect(root.querySelector('b')).toBe(b) // same node, text updated in place
    expect(b.textContent).toBe('on 1')
    ;(root.querySelector('.inc') as HTMLElement).click()
    flush()
    expect(root.querySelector('u')?.textContent).toBe('many')
    ;(root.querySelector('.flip') as HTMLElement).click()
    flush()
    expect(html(root)).toBe('<div><button class="inc">+</button><button class="flip">flip</button><i>off</i><u>many</u></div>')
  })

  it('element spreads: later attributes win, values stay live, handlers are listeners', async () => {
    const { state } = await import('weft')
    const tone = state('info')
    const clicks: string[] = []
    const rest = state<Record<string, any>>({ id: 'spread', href: '/a', title: 'spread title', class: 'x', onClick: () => clicks.push('a') })
    const root = mount(() => two.Spread({ get rest() { return rest.value }, get tone() { return tone.value } } as any))
    const a = root.querySelector('a')!
    expect(a.id).toBe('spread')
    expect(a.getAttribute('href')).toBe('/a')
    expect(a.title).toBe('fixed')
    expect(a.getAttribute('data-tone')).toBe('info')
    expect(a.className).toBe('x')
    expect(a.textContent!.trim()).toBe('link')
    a.click()
    rest.value = { href: '/b', onClick: () => clicks.push('b') }
    tone.value = 'warn'
    flush()
    a.click()
    expect(clicks).toEqual(['a', 'b'])
    expect(a.getAttribute('href')).toBe('/b')
    expect(a.id).toBe('first')
    expect(a.hasAttribute('class')).toBe(false)
    expect(a.getAttribute('data-tone')).toBe('warn')
  })

  it('refs: a variable is assigned, a function is called', () => {
    const seen: Element[] = []
    const root = mount(() => two.Refs({ seen: el => seen.push(el) }))
    expect(root.querySelector('output')!.textContent).toBe('box')
    expect(seen).toEqual([root.querySelector('span')])
  })

  it('<select value> is set after its options exist', () => {
    const root = mount(two.Picker)
    const select = root.querySelector('select')!
    expect(select.value).toBe('b')
    select.value = 'c'
    select.dispatchEvent(new Event('change'))
    flush()
    expect(select.value).toBe('c')
  })

  it('SVG: elements outside an <svg> parse as SVG; namespaced attributes keep their namespace', () => {
    const root = mount(two.Icon)
    const circle = root.querySelector('circle')!
    expect(circle.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(circle.getAttribute('r')).toBe('2')
    expect(root.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 10 10')
    expect(root.querySelector('use')!.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe('#dot')
    root.querySelector('svg')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    flush()
    expect(circle.getAttribute('r')).toBe('3')
  })
})
