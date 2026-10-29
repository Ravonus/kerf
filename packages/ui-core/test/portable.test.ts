// Portability: the core drives the specimen markup with plain DOM, no framework. Tabs wired by hand (nextIndex for
// keys, indicator + overflow for the face), a modal dialog, and a toast region rendered from the store: the same
// actions the weft binding attaches, so a React or Svelte binding is only rendering plus these calls.
import { dialog, indicator, nextIndex, overflow, toastStore, toaster } from '../src'

afterEach(() => document.body.replaceChildren())
const frames = () => new Promise(r => setTimeout(r, 100)) // three animation frames: place, then drop data-instant two frames later

test('tabs: arrow keys select and focus with one tab stop, panels follow, the indicator moves', async () => {
  document.body.innerHTML = `
    <div data-scope="tabs" data-part="root">
      <div data-part="list" role="tablist" aria-label="Settings">
        <button data-part="trigger" role="tab" type="button" id="t0" aria-controls="p0" aria-selected="true">Account</button>
        <button data-part="trigger" role="tab" type="button" id="t1" aria-controls="p1" aria-selected="false" tabindex="-1">Billing</button>
        <button data-part="trigger" role="tab" type="button" id="t2" aria-controls="p2" aria-selected="false" tabindex="-1">Team</button>
        <span data-part="indicator" aria-hidden="true" data-instant=""></span>
      </div>
      <div data-part="content" role="tabpanel" id="p0" aria-labelledby="t0" tabindex="0">A</div>
      <div data-part="content" role="tabpanel" id="p1" aria-labelledby="t1" tabindex="0" hidden>B</div>
      <div data-part="content" role="tabpanel" id="p2" aria-labelledby="t2" tabindex="0" hidden>C</div>
    </div>`
  const list = document.querySelector<HTMLElement>('[role="tablist"]')!
  const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')]
  const face = indicator(list, { selected: '[aria-selected="true"]', x: '--_ix', w: '--_iw' })
  const scroll = overflow(list)
  const select = (i: number) => {
    tabs.forEach((t, j) => {
      t.setAttribute('aria-selected', String(i === j))
      i === j ? t.removeAttribute('tabindex') : t.setAttribute('tabindex', '-1')
      document.getElementById(`p${j}`)!.hidden = i !== j
    })
    tabs[i].focus()
    face.update()
    scroll.update(tabs[i])
  }
  list.addEventListener('keydown', e => {
    const to = nextIndex(e.key, tabs.findIndex(t => t.getAttribute('aria-selected') === 'true'), tabs.length)
    if (to >= 0) { e.preventDefault(); select(to) }
  })
  await frames()
  const bar = list.querySelector<HTMLElement>('[data-part="indicator"]')!
  expect(bar.style.getPropertyValue('--_iw')).toMatch(/px$/)
  expect(bar.hasAttribute('data-instant')).toBe(false)

  tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
  expect(document.activeElement).toBe(tabs[2])
  expect(document.getElementById('p2')!.hidden).toBe(false)
  tabs[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
  expect(tabs[0].getAttribute('aria-selected')).toBe('true')
  expect(list.querySelectorAll('[role="tab"]:not([tabindex="-1"])')).toHaveLength(1)
  face.destroy()
  scroll.destroy()
})

test('dialog: opens modal with focus on the title, [data-close] asks to close, focus returns to the opener', () => {
  document.body.innerHTML = `
    <button id="open">Delete</button>
    <dialog data-scope="dialog" aria-labelledby="dt"><div data-part="header"><h2 data-part="title" id="dt">Delete item?</h2>
      <button data-part="close" data-close aria-label="Close">x</button></div><div data-part="body">Sure?</div></dialog>`
  const opener = document.getElementById('open')!
  const el = document.querySelector('dialog')!
  let open = false
  const d = dialog(el, { open, onClose: () => d.update({ open: (open = false), onClose: () => {} }) })
  opener.focus()
  d.update({ open: (open = true), onClose: () => d.update({ open: (open = false), onClose: () => {} }) })
  expect(el.open).toBe(true)
  expect(document.activeElement).toBe(el.querySelector('[data-part="title"]'))
  el.querySelector<HTMLElement>('[data-close]')!.click()
  expect(el.open).toBe(false)
  expect(open).toBe(false)
  expect(document.activeElement).toBe(opener)
  d.destroy()
})

test('toasts: a store, a hand-written render, and the toaster action (stacking, dismissal)', async () => {
  document.body.innerHTML = '<section data-scope="toast" data-part="region" aria-label="Notifications (F8)" tabindex="-1"></section>'
  const region = document.querySelector<HTMLElement>('section')!
  const toasts = toastStore()
  const render = () => {
    region.replaceChildren(...toasts.get().map(t => {
      const el = document.createElement('div')
      Object.assign(el.dataset, { scope: 'toast', part: 'root', id: t.id, tone: t.tone ?? 'neutral', ...(t.state && { state: t.state }) })
      el.setAttribute('role', 'group')
      el.innerHTML = `<div data-part="title"></div><div data-part="actions"><button data-x aria-label="Dismiss">x</button></div>`
      el.firstElementChild!.textContent = t.title
      el.querySelector('button')!.onclick = () => toasts.dismiss(t.id)
      return el
    }))
  }
  const unsubscribe = toasts.subscribe(render)
  const action = toaster(region, toasts)
  toasts.show({ title: 'Saved' })
  toasts.show({ title: 'Copied', tone: 'positive' })
  expect([...region.querySelectorAll('[data-part="title"]')].map(t => t.textContent)).toEqual(['Copied', 'Saved'])
  region.querySelector<HTMLElement>('[data-x]')!.click()
  expect(region.querySelector('[data-part="root"]')!.getAttribute('data-state')).toBe('closed')
  await new Promise(r => setTimeout(r, 450))
  expect(region.querySelectorAll('[data-part="root"]')).toHaveLength(1)
  action.destroy()
  unsubscribe()
})
