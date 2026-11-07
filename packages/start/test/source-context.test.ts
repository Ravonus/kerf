import { afterEach, describe, expect, it, vi } from 'vitest'
import { retainSourceContext } from '../src/run/source-context'
import { current_ } from '../src/run/helpers'

afterEach(() => {
  document.body.innerHTML = ''
  document.head.querySelectorAll('base').forEach((item) => item.remove())
  history.replaceState(null, '', '/from')
  vi.restoreAllMocks()
})

describe('retained source URL context', () => {
  it('pins retained controls but never the document base or incoming resources', () => {
    history.replaceState(null, '', '/dir/old?x=1')
    document.body.innerHTML = '<div id="app"><a href="child">go</a>' +
      '<a href="/elsewhere/new">next</a><form id="missing"></form>' +
      '<form id="relative" action="submit"><button formaction="">go</button></form></div>'
    const anchor = document.querySelector('a')!
    const missing = document.querySelector<HTMLFormElement>('#missing')!
    const form = document.querySelector<HTMLFormElement>('#relative')!
    const button = document.querySelector('button')!
    const source = location.href
    const context = retainSourceContext(document, source, document.baseURI)!
    history.pushState(null, '', '/elsewhere/new')
    expect(document.head.querySelector('base')).toBeNull()
    expect(document.baseURI).toBe(location.href)
    expect(anchor.href).toBe(new URL('child', source).href)
    current_('/elsewhere/new')
    expect(document.querySelector('a[href="http://localhost/elsewhere/new"]')
      ?.getAttribute('aria-current')).toBe('page')
    expect(missing.action).toBe(source)
    expect(form.action).toBe(new URL('submit', source).href)
    expect(button.getAttribute('formaction')).toBe(source)
    const image = document.createElement('img')
    image.src = 'photo.png'
    expect(image.src).toBe('http://localhost/elsewhere/photo.png')
    context.stop()
    context.release()
    context.release()
    expect(anchor.getAttribute('href')).toBe('child')
    expect(missing.hasAttribute('action')).toBe(false)
    expect(button.getAttribute('formaction')).toBe('')
  })

  it('leaves authored base changes and app action updates alone', async () => {
    history.replaceState(null, '', '/dir/old')
    document.head.innerHTML = '<base href="/assets/">'
    document.body.innerHTML = '<div id="app"><a href="child">go</a><form action=""></form></div>'
    const anchor = document.querySelector('a')!
    const form = document.querySelector('form')!
    const context = retainSourceContext(document, location.href, document.baseURI)!
    history.pushState(null, '', '/other/new')
    document.querySelector('base')!.href = '/new-base/'
    expect(anchor.href).toBe('http://localhost/assets/child')
    const image = document.createElement('img')
    image.src = 'new.png'
    expect(image.src).toBe('http://localhost/new-base/new.png')
    form.setAttribute('action', '/changed')
    await Promise.resolve()
    context.release()
    expect(form.getAttribute('action')).toBe('/changed')
    expect(anchor.getAttribute('href')).toBe('child')
    expect(document.querySelector('base')!.getAttribute('href')).toBe('/new-base/')
  })

  it('pins synchronously inserted forms before submit and requestSubmit', () => {
    history.replaceState(null, '', '/dir/old')
    document.body.innerHTML = '<div id="app"></div>'
    const seen: string[] = []
    vi.spyOn(HTMLFormElement.prototype, 'submit')
      .mockImplementation(function (this: HTMLFormElement) { seen.push(this.action) })
    vi.spyOn(HTMLFormElement.prototype, 'requestSubmit')
      .mockImplementation(function (this: HTMLFormElement) { seen.push(this.action) })
    const original = HTMLFormElement.prototype.submit
    const context = retainSourceContext(document, location.href, document.baseURI)!
    history.pushState(null, '', '/elsewhere/new')
    const form = document.createElement('form')
    document.querySelector('#app')!.append(form)
    form.submit()
    form.requestSubmit()
    expect(seen).toEqual(['http://localhost/dir/old', 'http://localhost/dir/old'])
    context.stop()
    expect(HTMLFormElement.prototype.submit).toBe(original)
    context.release()
    expect(form.hasAttribute('action')).toBe(false)
  })

  it('keeps post-capture handler mutations on the source through activation', () => {
    history.replaceState(null, '', '/dir/old')
    document.body.innerHTML = '<div id="app"><a href="child">go</a><form></form></div>'
    const anchor = document.querySelector('a')!
    const form = document.querySelector('form')!
    const context = retainSourceContext(document, location.href, document.baseURI)!
    history.pushState(null, '', '/elsewhere/new')
    anchor.addEventListener('click', () => {
      anchor.href = 'property'
      expect(anchor.href).toBe('http://localhost/dir/property')
      anchor.setAttributeNS(null, 'href', 'last-link')
    })
    form.addEventListener('submit', () => {
      form.action = 'property'
      expect(form.action).toBe('http://localhost/dir/property')
      form.setAttribute('action', 'last-submit')
    })
    let link = '', action = ''
    document.addEventListener('click', (event) => {
      link = anchor.href
      event.preventDefault()
    }, { once: true })
    document.addEventListener('submit', (event) => {
      action = form.action
      event.preventDefault()
    }, { once: true })
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }))
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(link).toBe('http://localhost/dir/last-link')
    expect(action).toBe('http://localhost/dir/last-submit')
    context.release()
    expect(anchor.getAttribute('href')).toBe('last-link')
    expect(form.getAttribute('action')).toBe('last-submit')
  })

  it('keeps foreign descriptor changes when releasing hooks', () => {
    const anchor = HTMLAnchorElement.prototype
    const element = Element.prototype
    const href = Object.getOwnPropertyDescriptor(anchor, 'href')!
    const setAttribute = Object.getOwnPropertyDescriptor(element, 'setAttribute')!
    const removeAttribute = Object.getOwnPropertyDescriptor(element, 'removeAttribute')!
    document.body.innerHTML = '<div id="app"><a href="child">go</a></div>'
    const context = retainSourceContext(document, location.href, document.baseURI)!
    const installedHref = Object.getOwnPropertyDescriptor(anchor, 'href')!
    const installedSet = Object.getOwnPropertyDescriptor(element, 'setAttribute')!
    const installedRemove = Object.getOwnPropertyDescriptor(element, 'removeAttribute')!
    const getter = () => 'foreign'
    const method = function (this: Element, name: string) {
      return Reflect.apply(installedRemove.value, this, [name])
    }
    try {
      Object.defineProperty(anchor, 'href', { ...installedHref, get: getter })
      Object.defineProperty(element, 'setAttribute', {
        ...installedSet, enumerable: !installedSet.enumerable, writable: !installedSet.writable,
      })
      Object.defineProperty(element, 'removeAttribute', { ...installedRemove, value: method })
      context.release()
      expect(Object.getOwnPropertyDescriptor(anchor, 'href')!.get).toBe(getter)
      expect(Object.getOwnPropertyDescriptor(element, 'setAttribute')).toEqual({
        ...installedSet, enumerable: !installedSet.enumerable, writable: !installedSet.writable,
      })
      expect(Object.getOwnPropertyDescriptor(element, 'removeAttribute')!.value).toBe(method)
    } finally {
      context.release()
      Object.defineProperty(anchor, 'href', href)
      Object.defineProperty(element, 'setAttribute', setAttribute)
      Object.defineProperty(element, 'removeAttribute', removeAttribute)
    }
  })

  it('keeps a foreign method descriptor flag change', () => {
    document.body.innerHTML = '<div id="app"></div>'
    const proto = Element.prototype
    const before = Object.getOwnPropertyDescriptor(proto, 'setAttribute')!
    const context = retainSourceContext(document, location.href, document.baseURI)!
    const installed = Object.getOwnPropertyDescriptor(proto, 'setAttribute')!
    const foreign = { ...installed, enumerable: !installed.enumerable, writable: !installed.writable }
    try {
      Object.defineProperty(proto, 'setAttribute', foreign)
      context.release()
      expect(Object.getOwnPropertyDescriptor(proto, 'setAttribute')).toEqual(foreign)
    } finally {
      context.release()
      Object.defineProperty(proto, 'setAttribute', before)
    }
  })

  it('chains existing and later form hooks without keeping the source active', () => {
    history.replaceState(null, '', '/dir/old')
    document.body.innerHTML = '<div id="app"><form></form></div>'
    const proto = HTMLFormElement.prototype
    const original = Object.getOwnPropertyDescriptor(proto, 'submit')!
    const seen: string[] = []
    const before = function (this: HTMLFormElement) { seen.push(this.action) }
    Object.defineProperty(proto, 'submit', { ...original, value: before })
    const context = retainSourceContext(document, location.href, document.baseURI)!
    const installed = proto.submit
    const after = function (this: HTMLFormElement) { Reflect.apply(installed, this, []) }
    try {
      Object.defineProperty(proto, 'submit', { ...original, value: after })
      history.pushState(null, '', '/elsewhere/new')
      const form = document.querySelector('form')!
      form.submit()
      context.release()
      expect(proto.submit).toBe(after)
      form.submit()
      expect(seen).toEqual(['http://localhost/dir/old', 'http://localhost/elsewhere/new'])
    } finally {
      context.release()
      Object.defineProperty(proto, 'submit', original)
    }
  })

  it('rolls back installed hooks if a later installation fails', () => {
    document.body.innerHTML = '<div id="app"></div>'
    const before = Object.getOwnPropertyDescriptor(Element.prototype, 'setAttribute')!
    const define = Object.defineProperty
    const spy = vi.spyOn(Object, 'defineProperty').mockImplementation((target, key, descriptor) => {
      if (target === HTMLFormElement.prototype && key === 'submit') throw new Error('locked')
      return define(target, key, descriptor)
    })
    try {
      expect(retainSourceContext(document, location.href, document.baseURI)).toBeNull()
      expect(Object.getOwnPropertyDescriptor(Element.prototype, 'setAttribute')).toEqual(before)
    } finally { spy.mockRestore() }
    const context = retainSourceContext(document, location.href, document.baseURI)
    expect(context).not.toBeNull()
    context?.release()
  })


  it('preserves a foreign hook during installation rollback', () => {
    document.body.innerHTML = '<div id="app"></div>'
    const proto = HTMLAnchorElement.prototype
    const before = Object.getOwnPropertyDescriptor(proto, 'href')!
    const getter = () => 'foreign'
    const define = Object.defineProperty
    const spy = vi.spyOn(Object, 'defineProperty').mockImplementation((target, key, descriptor) => {
      if (target === HTMLFormElement.prototype && key === 'submit') {
        const installed = Object.getOwnPropertyDescriptor(proto, 'href')!
        define(proto, 'href', { ...installed, get: getter })
        throw new Error('locked')
      }
      return define(target, key, descriptor)
    })
    try {
      expect(retainSourceContext(document, location.href, document.baseURI)).toBeNull()
      expect(Object.getOwnPropertyDescriptor(proto, 'href')!.get).toBe(getter)
    } finally {
      spy.mockRestore()
      Object.defineProperty(proto, 'href', before)
    }
  })
})
