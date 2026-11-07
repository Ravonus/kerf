import { afterEach, expect, it, vi } from 'vitest'
import { retainSourceContext } from '../src/run/source-context'

afterEach(() => {
  document.body.innerHTML = ''
  history.replaceState(null, '', '/from')
  vi.restoreAllMocks()
})

it.each(['setAttributeNode', 'setAttributeNodeNS'] as const)(
  'pins %s before click or submit propagation and restores authored attributes',
  (method) => {
    history.replaceState(null, '', '/dir/old')
    document.body.innerHTML =
      '<div id="app"><a href="x">go</a>' +
      '<form action="x"><button formaction="x">send</button></form></div>'
    const items = [
      document.querySelector('a')!,
      document.querySelector('form')!,
      document.querySelector('button')!,
    ]
    const names = ['href', 'action', 'formaction']
    const context = retainSourceContext(document, location.href, document.baseURI)!
    history.pushState(null, '', '/other/new')
    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!,
          name = names[i]!,
          old = item.getAttributeNode(name)!
        const added = document.createAttribute(name)
        added.value = `changed-${i}`
        let observed: string | null = null
        let returned: Attr | null = null
        const type = name === 'action' ? 'submit' : 'click'
        item.addEventListener(
          type,
          (event) => {
            returned = item[method](added)
            observed =
              name === 'href'
                ? (item as HTMLAnchorElement).href
                : name === 'action'
                  ? (item as HTMLFormElement).action
                  : item.getAttribute(name)
            event.preventDefault()
            event.stopPropagation()
          },
          { once: true },
        )
        item.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
        expect(returned).toBe(old)
        expect(observed).toBe(`http://localhost/dir/changed-${i}`)
      }
    } finally {
      context.release()
    }
    for (let i = 0; i < items.length; i++)
      expect(items[i]!.getAttribute(names[i]!)).toBe(`changed-${i}`)
  },
)

it('pins a missing form action after removeAttributeNode and preserves return/error behavior', () => {
  history.replaceState(null, '', '/dir/old')
  document.body.innerHTML = '<div id="app"><form action="x"></form></div>'
  const form = document.querySelector('form')!
  const context = retainSourceContext(document, location.href, document.baseURI)!
  history.pushState(null, '', '/other/new')
  try {
    const original = form.getAttributeNode('action')!
    let removed: Attr | null = null,
      observed = ''
    form.addEventListener(
      'submit',
      (event) => {
        removed = form.removeAttributeNode(original)
        observed = form.action
        event.preventDefault()
        event.stopPropagation()
      },
      { once: true },
    )
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(removed).toBe(original)
    expect(observed).toBe('http://localhost/dir/old')
    expect(() => form.removeAttributeNode(original)).toThrowError(
      expect.objectContaining({ name: 'NotFoundError' }),
    )
  } finally {
    context.release()
  }
  expect(form.hasAttribute('action')).toBe(false)
})

it('pins a pre-captured detached map immediately after insertion', () => {
  history.replaceState(null, '', '/dir/old')
  document.body.innerHTML = '<div id="app"></div>'
  const anchor = document.createElement('a')
  anchor.setAttribute('href', 'initial')
  const map = anchor.attributes
  const context = retainSourceContext(document, location.href, document.baseURI)!
  history.pushState(null, '', '/other/new')
  try {
    document.querySelector('#app')!.append(anchor)
    const attr = document.createAttribute('href')
    attr.value = 'changed'
    expect(map.setNamedItem(attr)?.name).toBe('href')
    expect(anchor.href).toBe('http://localhost/dir/changed')
  } finally {
    context.release()
  }
  expect(anchor.getAttribute('href')).toBe('changed')
})

it('resolves a pre-captured detached form map before removal', () => {
  history.replaceState(null, '', '/dir/old')
  document.body.innerHTML = '<div id="app"></div>'
  const form = document.createElement('form')
  form.setAttribute('action', 'initial')
  const map = form.attributes
  const context = retainSourceContext(document, location.href, document.baseURI)!
  history.pushState(null, '', '/other/new')
  try {
    document.querySelector('#app')!.append(form)
    const removed = map.removeNamedItemNS(null, 'action')
    expect(removed.value).toBe('initial')
    expect(form.action).toBe('http://localhost/dir/old')
  } finally {
    context.release()
  }
  expect(form.hasAttribute('action')).toBe(false)
})

it('preserves foreign namespaces, native in-use errors and same-attribute return', () => {
  history.replaceState(null, '', '/dir/old')
  document.body.innerHTML = '<div id="app"><a href="child">go</a></div><a id="outside"></a>'
  const anchor = document.querySelector('#app a')!
  const outside = document.querySelector('#outside')!
  const context = retainSourceContext(document, location.href, document.baseURI)!
  try {
    const same = anchor.getAttributeNode('href')!
    expect(anchor.setAttributeNode(same)).toBe(same)
    const foreign = document.createAttributeNS('urn:test', 'x:href')
    foreign.value = 'relative'
    expect(anchor.setAttributeNodeNS(foreign)).toBeNull()
    expect(anchor.getAttributeNS('urn:test', 'href')).toBe('relative')
    const taken = document.createAttribute('href')
    taken.value = 'foreign'
    outside.setAttributeNode(taken)
    expect(() => anchor.setAttributeNode(taken)).toThrowError(
      expect.objectContaining({ name: 'InUseAttributeError' }),
    )
    expect(taken.value).toBe('foreign')
    expect(anchor.removeAttributeNode(foreign)).toBe(foreign)
  } finally {
    context.release()
  }
  expect(anchor.getAttribute('href')).toBe('child')
})

it('keeps foreign node-method wrappers and honors the next source context', () => {
  history.replaceState(null, '', '/dir/old')
  document.body.innerHTML = '<div id="app"><a href="child">go</a></div>'
  const anchor = document.querySelector('a')!
  const before = Object.getOwnPropertyDescriptor(Element.prototype, 'setAttributeNode')!
  const first = retainSourceContext(document, location.href, document.baseURI)!
  // oxlint-disable-next-line typescript/unbound-method -- the native method is kept to be called with .call()
  const installed = Element.prototype.setAttributeNode
  const foreign = function (this: Element, attr: Attr) {
    return Reflect.apply(installed, this, [attr])
  }
  Object.defineProperty(Element.prototype, 'setAttributeNode', { ...before, value: foreign })
  try {
    first.stop()
    // oxlint-disable-next-line typescript/unbound-method -- the native method is kept to be called with .call()
    expect(Element.prototype.setAttributeNode).toBe(foreign)
    history.pushState(null, '', '/other/new')
    const second = retainSourceContext(document, location.href, document.baseURI)!
    try {
      first.release()
      const attr = document.createAttribute('href')
      attr.value = 'later'
      anchor.setAttributeNode(attr)
      expect(anchor.href).toBe('http://localhost/other/later')
    } finally {
      second.release()
    }
    // oxlint-disable-next-line typescript/unbound-method -- the native method is kept to be called with .call()
    expect(Element.prototype.setAttributeNode).toBe(foreign)
    expect(anchor.getAttribute('href')).toBe('later')
  } finally {
    first.release()
    Object.defineProperty(Element.prototype, 'setAttributeNode', before)
  }
})

it('rolls back installed hooks if an attribute-node method cannot be wrapped', () => {
  document.body.innerHTML = '<div id="app"><a href="x">go</a></div>'
  const element = Object.getOwnPropertyDescriptor(Element.prototype, 'setAttributeNode')!
  const map = Object.getOwnPropertyDescriptor(NamedNodeMap.prototype, 'setNamedItem')!
  const define = Object.defineProperty
  const spy = vi.spyOn(Object, 'defineProperty').mockImplementation((target, key, descriptor) => {
    if (target === Element.prototype && key === 'setAttributeNodeNS') throw new Error('locked')
    return define(target, key, descriptor)
  })
  try {
    expect(retainSourceContext(document, location.href, document.baseURI)).toBeNull()
    expect(Object.getOwnPropertyDescriptor(Element.prototype, 'setAttributeNode')).toEqual(element)
    expect(Object.getOwnPropertyDescriptor(NamedNodeMap.prototype, 'setNamedItem')).toEqual(map)
  } finally {
    spy.mockRestore()
  }
  const context = retainSourceContext(document, location.href, document.baseURI)
  expect(context).not.toBeNull()
  context?.release()
})
