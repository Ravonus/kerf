// weft's back end (research 19): what its output does, construct by construct. The corpus oracle
// (oracle.test.tsx) checks whole components against Solid's recorded output and the server render.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flush } from 'weft'
import { render } from 'weft/dom'
import * as basics from './fixtures/next/Basics'
import { Main as Bench } from './fixtures/next/Bench'
import * as two from './fixtures/next/Step2'
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

const click = (sel: string) => (root: Element) => (root.querySelector(sel) as HTMLElement).click()

describe('weft back end: basics', () => {
  it('compiles without Solid-shaped helpers', () => {
    const out = transform(readFileSync(resolve(__dirname, 'fixtures/next/Basics.tsx'), 'utf8'), { filename: 'Basics.tsx' })
    expect(out.diagnostics).toEqual([])
    const imported = /import \{([^}]*)\} from "weft\/dom"/.exec(out.code)![1]
    const helpers = ['attr', 'bind', 'child', 'cls', 'component', 'css', 'delegate', 'memo', 'mergeProps', 'on', 'tpl']
    for (const name of imported.split(',').map(s => s.trim().split(' ')[0])) expect(helpers).toContain(name)
    expect(out.code).not.toMatch(/insert|createComponent|template\(|delegateEvents/)
  })

  it('hello', () => {
    expect(html(mount(basics.Hello))).toBe('<p>Hello, world</p>')
  })

  it('counter', () => {
    const root = mount(basics.Counter)
    for (const _ of [1, 2]) {
      click('button')(root)
      flush()
    }
    expect(root.textContent).toBe('2 × 2 = 4')
  })

  it('attributes, class, style, properties, events, text, components, fragments', () => {
    const type = (v: string) => (root: Element) => {
      const input = root.querySelector('input')!
      input.value = v
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const root = mount(basics.Panel)
    for (const step of [type('Grace'), click('.tone'), click('.wider'), click('button'), click('button')]) {
      step(root)
      flush()
    }
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

    it('runs every benchmark operation', () => {
      const root = mount(Bench)
      const rows = () => [...root.querySelectorAll('tbody tr')]
      const label = (i: number) => rows()[i].querySelector('td:nth-child(2) a')!.textContent!
      const go = (sel: string) => {
        click(sel)(root)
        flush()
      }
      go('#run')
      expect(rows()).toHaveLength(1000)
      go('tbody tr:nth-child(5) td:nth-child(2) a')
      expect(rows()[4].className).toBe('danger')
      go('#update')
      expect(label(0).endsWith(' !!!') && label(10).endsWith(' !!!') && !label(1).endsWith(' !!!')).toBe(true)
      const [second, last] = [rows()[1], rows()[998]]
      go('#swaprows')
      expect([rows()[1], rows()[998]]).toEqual([last, second])
      const third = rows()[2]
      go('tbody tr:nth-child(3) td:nth-child(3) a')
      expect(rows()).toHaveLength(999)
      expect(rows()).not.toContain(third)
      go('#add')
      expect(rows()).toHaveLength(1999)
      go('#clear')
      expect(rows()).toHaveLength(0)
    })
  })
})

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
