// The field shell, pinned as a trace: one scripted session, timers run by hand, with the DOM state it leaves after every
// step recorded. A rewrite for size passes only if every attribute and measured property lands exactly as before.
import { field } from '../src/floating-label'
import { installSweep } from '../src/sweep'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] }))
afterEach(() => { installSweep().destroy(); document.head.replaceChildren(); document.body.replaceChildren(); vi.useRealTimers() })

const pointer = (type: string, el: Element, init: PointerEventInit = {}) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'mouse', ...init }))
const settle = async (ms = 0) => { await Promise.resolve(); vi.advanceTimersByTime(ms); await Promise.resolve() }
const $ = (s: string) => document.querySelector<HTMLElement>(s)!

test('field shell: a scripted session', async () => {
  // jsdom has no layout: give the parts the box the measurement reads (and no canvas: translucent colours are checked
  // in a browser, not here)
  const box = (sel: string, o: Record<string, number>) => { for (const el of document.querySelectorAll(sel)) for (const [k, v] of Object.entries(o)) Object.defineProperty(el, k, { value: v, configurable: true }) }
  document.head.innerHTML = `<style>
    .panel { background-color: rgb(250, 250, 250) } .tint { background-color: rgba(0, 0, 0, 0) } .glass { background-color: transparent }
    .grad { background-image: linear-gradient(red, blue); background-color: rgb(1, 2, 3) }
    [data-part="control"] { transition-property: clip-path; transition-duration: 400ms }
  </style>`
  document.body.innerHTML = `
    <div class="panel"><div class="tint"><div class="glass"><div data-scope="field" id="f1" data-counter="5"><div data-part="control"><label data-part="label"><span data-part="label-text">Name</span><span data-part="label-chars"><span data-char data-c="N"></span><span data-char data-c="a"></span></span></label><input data-part="input" id="i1"><button data-part="clear" type="button">x</button></div><div data-part="message"><span data-part="counter"></span></div></div></div></div></div>
    <div class="grad" id="g"><div data-scope="field" id="f2"><div data-part="control"><label data-part="label"><span data-part="label-chars"><span data-char data-c="S"></span></span></label><select data-part="input"><option value="">Pick</option><option value="b">B</option></select></div></div></div>
    <div data-scope="field" id="f3"><div data-part="control"><label data-part="label"></label><textarea data-part="input"></textarea></div></div>`
  box('[data-part="control"]', { offsetWidth: 200, offsetLeft: 10, offsetTop: 20 })
  box('[data-part="label"]', { offsetLeft: 12 })
  box('[data-char]', { offsetLeft: 30 })
  box('#g', { offsetWidth: 300, clientWidth: 300, clientHeight: 100, offsetLeft: 5, offsetTop: 6, clientLeft: 1, clientTop: 1 })
  const state = () =>
    [...document.querySelectorAll<HTMLElement>('[data-scope="field"]')].map(f => {
      const c = f.querySelector<HTMLElement>('[data-part="control"]')!, l = c.querySelector<HTMLElement>('[data-part="label"]')!
      const n = f.querySelector<HTMLElement>('[data-part="counter"]')
      const chars = [...l.querySelectorAll<HTMLElement>('[data-char]')].map(x => x.style.getPropertyValue('--d')).join(',')
      return `${f.id}: filled=${c.hasAttribute('data-filled')} chars=[${chars}] notch=${l.getAttribute('style') ?? ''} counter=${n ? `${n.textContent}/${n.dataset.level ?? ''}` : '-'} value=${(c.querySelector('[data-part="input"]') as HTMLInputElement).value}`
    }).join(' | ')
  const trace: string[] = []
  const actions = ['#f1', '#f2', '#f3'].map(s => field($(s)))
  const step = async (label: string, act: () => unknown, ms = 0) => { await act(); await settle(ms); trace.push(`${label} → ${state()}`) }
  await step('attach', () => {}, 20)
  const i1 = $('#i1') as HTMLInputElement
  await step('type 4', () => { i1.value = 'abcd'; i1.dispatchEvent(new Event('input', { bubbles: true })) })
  await step('type 6', () => { i1.value = 'abcdef'; i1.dispatchEvent(new Event('input', { bubbles: true })) })
  await step('clear', () => $('#f1 [data-part="clear"]').click())
  trace.push(`focus after clear: ${document.activeElement?.id}`)
  await step('select b', () => { const s = $('#f2 select') as HTMLSelectElement; s.value = 'b'; s.dispatchEvent(new Event('change', { bubbles: true })) })
  await step('press control', () => { i1.blur(); pointer('pointerdown', $('#f1 [data-part="control"]')) })
  trace.push(`focus after press: ${document.activeElement?.id}`)
  await step('programmatic write + update', () => { i1.value = 'xy'; actions[0].update() }, 20)
  await step('font-size settles', () => $('#f1 [data-part="label"]').dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'font-size' })))
  actions.forEach(a => a.destroy())
  await step('destroyed: input no longer counted', () => { i1.value = 'abcdefgh'; i1.dispatchEvent(new Event('input', { bubbles: true })) })
  expect(trace).toMatchSnapshot()
})
