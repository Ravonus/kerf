import { afterEach, describe, expect, it } from 'vitest'
import { retainSourceContext } from '../src/run/source-context'

afterEach(() => {
  document.body.innerHTML = ''
  document.head.querySelectorAll('base').forEach((item) => item.remove())
  history.replaceState(null, '', '/from')
})

describe('retained source URL context', () => {
  it('keeps native links and forms based on the source until release', async () => {
    history.replaceState(null, '', '/dir/old?x=1')
    document.body.innerHTML = '<a href="child">go</a><form id="missing"></form>' +
      '<form id="relative" action="submit"><button formaction="">go</button></form>'
    const anchor = document.querySelector('a')!
    const missing = document.querySelector<HTMLFormElement>('#missing')!
    const form = document.querySelector<HTMLFormElement>('#relative')!
    const button = document.querySelector('button')!
    const source = location.href
    const base = document.baseURI
    const release = retainSourceContext(document, source, base)
    history.pushState(null, '', '/elsewhere/new')
    expect(anchor.href).toBe(new URL('child', source).href)
    expect(missing.action).toBe(source)
    expect(form.action).toBe(new URL('submit', source).href)
    expect(button.getAttribute('formaction')).toBe(source)
    const added = document.createElement('form')
    document.body.append(added)
    await Promise.resolve()
    expect(added.action).toBe(source)
    release()
    release()
    expect(missing.hasAttribute('action')).toBe(false)
    expect(button.getAttribute('formaction')).toBe('')
    expect(added.hasAttribute('action')).toBe(false)
    expect(anchor.href).toBe(new URL('child', location.href).href)
  })

  it('preserves the original base and does not overwrite changed actions', async () => {
    history.replaceState(null, '', '/dir/old')
    document.head.innerHTML = '<base href="/assets/">'
    document.body.innerHTML = '<a href="child">go</a><form action=""></form>'
    const anchor = document.querySelector('a')!
    const form = document.querySelector('form')!
    const source = location.href
    const release = retainSourceContext(document, source, document.baseURI)
    history.pushState(null, '', '/other/new')
    expect(anchor.href).toBe(new URL('/assets/child', source).href)
    form.setAttribute('action', '/changed')
    const competing = document.createElement('base')
    competing.href = '/wrong/'
    document.head.prepend(competing)
    await Promise.resolve()
    expect(anchor.href).toBe(new URL('/assets/child', source).href)
    competing.remove()
    release()
    expect(form.getAttribute('action')).toBe('/changed')
    expect(document.head.querySelectorAll('base')).toHaveLength(1)
  })
})
