import { afterEach, describe, expect, it, vi } from 'vitest'
import { retainSourceContext } from '../src/run/source-context'

afterEach(() => {
  document.body.innerHTML = ''
  history.replaceState(null, '', '/from')
  vi.restoreAllMocks()
})

describe('retained source attribute mutations', () => {
  it.each(['value', 'nodeValue', 'textContent'] as const)(
    'pins Attr.%s writes before event propagation', (property) => {
      history.replaceState(null, '', '/dir/old')
      document.body.innerHTML = '<div id="app"><a href="x">go</a>' +
        '<form action="x"><button formaction="x">send</button></form></div>'
      const items = [document.querySelector('a')!, document.querySelector('form')!,
        document.querySelector('button')!]
      const names = ['href', 'action', 'formaction']
      const context = retainSourceContext(document, location.href, document.baseURI)!
      history.pushState(null, '', '/other/new')
      try {
        for (let i = 0; i < items.length; i++) {
          const item = items[i]!, name = names[i]!
          let observed: string | null = null
          const type = name === 'action' ? 'submit' : 'click'
          item.addEventListener(type, (event) => {
            item.getAttributeNode(name)![property] = `changed-${i}`
            observed = name === 'href' ? (item as HTMLAnchorElement).href :
              name === 'action' ? (item as HTMLFormElement).action : item.getAttribute(name)
            event.preventDefault()
            event.stopPropagation()
          }, { once: true })
          item.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
          expect(observed).toBe(`http://localhost/dir/changed-${i}`)
        }
      } finally { context.release() }
      for (let i = 0; i < items.length; i++)
        expect(items[i]!.getAttribute(names[i]!)).toBe(`changed-${i}`)
    },
  )

  it.each(['setNamedItem', 'setNamedItemNS'] as const)(
    'pins NamedNodeMap.%s writes before event propagation', (method) => {
      history.replaceState(null, '', '/dir/old')
      document.body.innerHTML = '<div id="app"><a href="x">go</a>' +
        '<form action="x"><button formaction="x">send</button></form></div>'
      const items = [document.querySelector('a')!, document.querySelector('form')!,
        document.querySelector('button')!]
      const maps = items.map((item) => item.attributes)
      const names = ['href', 'action', 'formaction']
      const context = retainSourceContext(document, location.href, document.baseURI)!
      history.pushState(null, '', '/other/new')
      try {
        for (let i = 0; i < items.length; i++) {
          const item = items[i]!, name = names[i]!
          let observed: string | null = null
          const type = name === 'action' ? 'submit' : 'click'
          item.addEventListener(type, (event) => {
            const attr = document.createAttribute(name)
            attr.value = `changed-${i}`
            maps[i]![method](attr)
            observed = name === 'href' ? (item as HTMLAnchorElement).href :
              name === 'action' ? (item as HTMLFormElement).action : item.getAttribute(name)
            event.preventDefault()
            event.stopPropagation()
          }, { once: true })
          item.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
          expect(observed).toBe(`http://localhost/dir/changed-${i}`)
        }
      } finally { context.release() }
      for (let i = 0; i < items.length; i++)
        expect(items[i]!.getAttribute(names[i]!)).toBe(`changed-${i}`)
    },
  )

  it.each(['removeNamedItem', 'removeNamedItemNS'] as const)(
    'keeps missing form action on the source after NamedNodeMap.%s', (method) => {
      history.replaceState(null, '', '/dir/old')
      document.body.innerHTML = '<div id="app"><a href="x">go</a>' +
        '<form action="x"><button formaction="x">go</button></form></div>'
      const form = document.querySelector('form')!
      const anchor = document.querySelector('a')!
      const button = document.querySelector('button')!
      const context = retainSourceContext(document, location.href, document.baseURI)!
      history.pushState(null, '', '/other/new')
      try {
        if (method === 'removeNamedItem') form.attributes.removeNamedItem('action')
        else form.attributes.removeNamedItemNS(null, 'action')
        expect(form.action).toBe('http://localhost/dir/old')
        if (method === 'removeNamedItem') {
          anchor.attributes.removeNamedItem('href')
          button.attributes.removeNamedItem('formaction')
        } else {
          anchor.attributes.removeNamedItemNS(null, 'href')
          button.attributes.removeNamedItemNS(null, 'formaction')
        }
        expect(anchor.hasAttribute('href')).toBe(false)
        expect(button.hasAttribute('formaction')).toBe(false)
      } finally { context.release() }
      expect(form.hasAttribute('action')).toBe(false)
      expect(anchor.hasAttribute('href')).toBe(false)
      expect(button.hasAttribute('formaction')).toBe(false)
    },
  )


  it('leaves namespaced and foreign attributes alone and preserves native errors', () => {
    history.replaceState(null, '', '/dir/old')
    document.body.innerHTML = '<div id="app"><a href="x">go</a></div><a id="outside"></a>'
    const anchor = document.querySelector('#app a')!
    const outside = document.querySelector('#outside')!
    const context = retainSourceContext(document, location.href, document.baseURI)!
    try {
      const namespaced = document.createAttributeNS('urn:test', 'x:href')
      namespaced.value = 'relative'
      anchor.attributes.setNamedItemNS(namespaced)
      namespaced.value = 'still-relative'
      expect(anchor.getAttributeNS('urn:test', 'href')).toBe('still-relative')
      const foreign = document.createAttribute('href')
      foreign.value = 'foreign'
      outside.attributes.setNamedItem(foreign)
      expect(() => anchor.attributes.setNamedItem(foreign)).toThrow()
      expect(foreign.value).toBe('foreign')
    } finally { context.release() }
  })

  it('keeps newer contexts and foreign attribute hooks after the old context stops', () => {
    history.replaceState(null, '', '/dir/old')
    document.body.innerHTML = '<div id="app"><a href="x">go</a></div>'
    const anchor = document.querySelector('a')!
    const original = Object.getOwnPropertyDescriptor(Node.prototype, 'nodeValue')!
    const first = retainSourceContext(document, location.href, document.baseURI)!
    const installed = Object.getOwnPropertyDescriptor(Node.prototype, 'nodeValue')!
    const getter = function (this: Node) { return Reflect.apply(installed.get!, this, []) }
    Object.defineProperty(Node.prototype, 'nodeValue', { ...installed, get: getter })
    try {
      first.stop()
      expect(Object.getOwnPropertyDescriptor(Node.prototype, 'nodeValue')!.get).toBe(getter)
      history.pushState(null, '', '/other/new')
      const second = retainSourceContext(document, location.href, document.baseURI)!
      try {
        first.release()
        anchor.getAttributeNode('href')!.nodeValue = 'latest'
        expect(anchor.href).toBe('http://localhost/other/latest')
      } finally { second.release() }
      expect(anchor.getAttribute('href')).toBe('latest')
    } finally {
      first.release()
      Object.defineProperty(Node.prototype, 'nodeValue', original)
    }
  })

  it('rolls back new attribute hooks if a map hook cannot be installed', () => {
    document.body.innerHTML = '<div id="app"><a href="x">go</a></div>'
    const node = Object.getOwnPropertyDescriptor(Node.prototype, 'nodeValue')!
    const attr = Object.getOwnPropertyDescriptor(Attr.prototype, 'value')!
    const attrs = Object.getOwnPropertyDescriptor(Element.prototype, 'attributes')!
    const define = Object.defineProperty
    const spy = vi.spyOn(Object, 'defineProperty').mockImplementation((target, key, descriptor) => {
      if (target === NamedNodeMap.prototype && key === 'removeNamedItemNS') throw new Error('locked')
      return define(target, key, descriptor)
    })
    try {
      expect(retainSourceContext(document, location.href, document.baseURI)).toBeNull()
      expect(Object.getOwnPropertyDescriptor(Node.prototype, 'nodeValue')).toEqual(node)
      expect(Object.getOwnPropertyDescriptor(Attr.prototype, 'value')).toEqual(attr)
      expect(Object.getOwnPropertyDescriptor(Element.prototype, 'attributes')).toEqual(attrs)
    } finally { spy.mockRestore() }
    const context = retainSourceContext(document, location.href, document.baseURI)
    expect(context).not.toBeNull()
    context?.release()
  })


  it('preserves the authored value when setting the already owned Attr again', () => {
    history.replaceState(null, '', '/dir/old')
    document.body.innerHTML = '<div id="app"><a href="child">go</a></div>'
    const anchor = document.querySelector('a')!
    const context = retainSourceContext(document, location.href, document.baseURI)!
    try {
      const attr = anchor.getAttributeNode('href')!
      expect(anchor.attributes.setNamedItem(attr)).toBe(attr)
      expect(anchor.href).toBe('http://localhost/dir/child')
    } finally { context.release() }
    expect(anchor.getAttribute('href')).toBe('child')
  })


  it('leaves a later map wrapper installed and inert after release', () => {
    history.replaceState(null, '', '/dir/old')
    document.body.innerHTML = '<div id="app"><a href="child">go</a></div>'
    const anchor = document.querySelector('a')!
    const proto = NamedNodeMap.prototype
    const before = Object.getOwnPropertyDescriptor(proto, 'setNamedItem')!
    const context = retainSourceContext(document, location.href, document.baseURI)!
    const installed = proto.setNamedItem
    const foreign = function (this: NamedNodeMap, attr: Attr) {
      return Reflect.apply(installed, this, [attr]) as Attr | null
    }
    Object.defineProperty(proto, 'setNamedItem', { ...before, value: foreign })
    try {
      context.release()
      expect(proto.setNamedItem).toBe(foreign)
      history.pushState(null, '', '/other/new')
      const attr = document.createAttribute('href')
      attr.value = 'later'
      anchor.attributes.setNamedItem(attr)
      expect(anchor.href).toBe('http://localhost/other/later')
    } finally {
      context.release()
      Object.defineProperty(proto, 'setNamedItem', before)
    }
  })

})
