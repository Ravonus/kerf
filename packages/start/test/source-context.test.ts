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
})
