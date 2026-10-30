// The sweep machine and the field shell, pinned as traces: one scripted session each (every host kind, every event
// the machine follows, timers run by hand), with the DOM state it leaves after every step recorded. A rewrite for size
// passes only if every phase, attribute and measured property lands exactly as before.
import { field } from '../src/floating-label'
import { installSweep } from '../src/sweep'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] }))
afterEach(() => { installSweep().destroy(); document.head.replaceChildren(); document.body.replaceChildren(); vi.useRealTimers() })

const pointer = (type: string, el: Element, init: PointerEventInit = {}) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'mouse', ...init }))
const settle = async (ms = 0) => { await Promise.resolve(); vi.advanceTimersByTime(ms); await Promise.resolve() }
const $ = (s: string) => document.querySelector<HTMLElement>(s)!

// every [data-sweep] host's phase and the attributes the machine writes, in document order
const hosts = () =>
  [...document.querySelectorAll<HTMLElement>('[data-sweep], [data-trace]')]
    .map(h => `${h.id || h.tagName}:${h.dataset.phase ?? '-'}${h.hasAttribute('data-confirm') ? '+confirm' : ''}${h.hasAttribute('data-touch-effect') ? '+touch' : ''}${h.hasAttribute('data-pin') ? '+pin' : ''}`)
    .join(' ')

// research 24 §6.5: the observer re-steps an unpinned host, which used to clear the backstop timer it had just set,
// so a host whose part never fires transitionend stayed "out"
test('unpinning a host falls back to the backstop timer', async () => {
  document.head.innerHTML = `<style>[data-part="sweep"] { transition-property: clip-path; transition-duration: 300ms }</style>`
  document.body.innerHTML = `<button id="b" data-sweep data-phase="idle"><span data-part="sweep"></span>B</button>`
  const m = installSweep()
  m.pin($('#b'), true)
  await settle()
  expect($('#b').dataset.phase).toBe('in')
  m.pin($('#b'), false)
  await settle()
  expect($('#b').dataset.phase).toBe('out')
  await settle(451)
  expect($('#b').dataset.phase).toBe('idle')
})

test('sweep machine: a scripted session', async () => {
  document.head.innerHTML = `<style>
    [data-part="sweep"], [data-part="sweep-corners"], [data-part="rail-hover"] { transition-property: clip-path; transition-duration: 300ms }
    [data-expression="vivid"] [data-part="sweep"] { transition-duration: .5s }
    [data-phase="idle"] > [data-part="sweep"] { transition-property: none }
  </style>`
  document.body.innerHTML = `
    <button id="soft" data-sweep data-phase="idle"><span data-part="sweep"></span>Soft</button>
    <button id="frame" data-sweep data-phase="idle"><span data-part="sweep-corners"></span><span data-part="sweep-outline"></span>Frame</button>
    <button id="pressed" data-sweep aria-pressed="true"><span data-part="sweep"></span>On</button>
    <button id="menu" data-sweep data-phase="idle" aria-expanded="false"><span data-part="sweep"></span>Menu</button>
    <div data-expression="vivid"><button id="vivid" data-sweep data-phase="idle"><span data-part="sweep"></span>Vivid</button></div>
    <label data-scope="checkbox" id="cb-label"><input type="checkbox" id="cb"><span id="cb-host" data-part="control" data-sweep data-phase="idle"><span data-part="sweep"></span></span>Agree</label>
    <label data-scope="switch"><input type="checkbox" id="sw"><span id="sw-host" data-part="track" data-sweep data-phase="idle"><span data-part="rail-fill"><span data-part="rail-hover"></span></span></span>Wi-Fi</label>
    <div data-scope="field" id="field"><div id="field-host" data-part="control" data-sweep data-phase="idle"><span data-part="sweep"></span><input id="in" data-part="input"></div></div>
    <div id="card" data-sweep="surface" data-phase="idle"><span data-part="sweep"></span><button id="inner">x</button></div>
    <span id="static" data-sweep data-static data-phase="in"></span>
    <div id="popover" data-sweep data-phase="idle" popover="manual"><span data-part="sweep"></span></div>
    <div id="heading" data-sweep data-phase="idle"><div data-part="heading"><button id="acc" aria-expanded="false">Q</button></div><span data-part="sweep"></span></div>`
  const m = installSweep()
  const trace: string[] = []
  const step = async (label: string, act: () => unknown, ms = 0) => { await act(); await settle(ms); trace.push(`${label} → ${hosts()}`) }

  await step('install', () => {})
  await step('hover soft', () => pointer('pointerover', $('#soft span')))
  await step('move within soft', () => pointer('pointerout', $('#soft span'), { relatedTarget: $('#soft') }))
  await step('leave soft', () => pointer('pointerout', $('#soft'), { relatedTarget: document.body }))
  await step('soft transitionend', () => $('#soft [data-part="sweep"]').dispatchEvent(new TransitionEvent('transitionend', { bubbles: true, propertyName: 'clip-path' })))
  await step('hover frame', () => pointer('pointerover', $('#frame')))
  await step('leave frame', () => pointer('pointerout', $('#frame'), { relatedTarget: document.body }))
  await step('frame backstop', () => {}, 449)
  await step('frame backstop end', () => {}, 2)
  await step('re-hover while out', async () => { pointer('pointerover', $('#vivid')); pointer('pointerout', $('#vivid'), { relatedTarget: document.body }); await settle(); pointer('pointerover', $('#vivid')) })
  await step('vivid leave + 649ms', () => pointer('pointerout', $('#vivid'), { relatedTarget: document.body }), 649)
  await step('vivid +2ms', () => {}, 2)
  await step('wrong transitionend', () => { pointer('pointerover', $('#soft')); pointer('pointerout', $('#soft'), { relatedTarget: document.body }); $('#soft').dispatchEvent(new TransitionEvent('transitionend', { bubbles: true, propertyName: 'opacity' })) })
  await step('soft backstop', () => {}, 451)
  await step('expand menu', () => $('#menu').setAttribute('aria-expanded', 'true'))
  await step('collapse menu', () => $('#menu').setAttribute('aria-expanded', 'false'), 451)
  await step('unpress', () => $('#pressed').setAttribute('aria-pressed', 'false'), 451)
  await step('hover checkbox label', () => pointer('pointerover', $('#cb-label')))
  await step('leave checkbox label', () => pointer('pointerout', $('#cb-label'), { relatedTarget: document.body }), 451)
  await step('hover switch text', () => pointer('pointerover', $('#sw')))
  await step('leave switch', () => pointer('pointerout', $('#sw'), { relatedTarget: document.body }), 451)
  await step('focus field', () => { $('#in').focus() }, 20)
  await step('blur field', () => { $('#in').blur() }, 471)
  await step('field data-open', () => $('#field').setAttribute('data-open', ''), 20)
  await step('field closed', () => $('#field').removeAttribute('data-open'), 451)
  await step('touch soft', () => pointer('pointerdown', $('#soft'), { pointerType: 'touch' }))
  await step('touch hover ignored', () => pointer('pointerover', $('#frame'), { pointerType: 'touch' }))
  await step('touch +379ms', () => {}, 379)
  await step('touch +2ms', () => {}, 2)
  await step('touch out', () => {}, 451)
  await step('confirm card', () => m.confirm($('#card')))
  await step('confirm +300', () => {}, 300)
  await step('confirm +451', () => {}, 451)
  await step('pin soft', () => m.pin($('#soft'), true))
  await step('unpin soft', () => m.pin($('#soft'), false), 451)
  await step('static untouched', () => pointer('pointerover', $('#static')))
  await step('accordion child expanded', () => $('#acc').setAttribute('aria-expanded', 'true'))
  await step('accordion collapsed', () => $('#acc').setAttribute('aria-expanded', 'false'), 451)
  await step('popover data-state', () => $('#popover').setAttribute('data-state', 'open'))
  await step('popover closed', () => $('#popover').removeAttribute('data-state'), 451)
  await step('add host', () => { const b = document.createElement('button'); b.id = 'late'; b.setAttribute('data-sweep', ''); b.innerHTML = '<span data-part="sweep"></span>'; document.body.append(b) })
  await step('hover late', () => pointer('pointerover', $('#late')))
  await step('data-sweep added', () => { $('#inner').setAttribute('data-sweep', '') })
  await step('remove late while in', () => $('#late').remove(), 451)
  await step('durations', () => { trace.push(`durations soft=${m.duration($('#soft'))} frame=${m.duration($('#frame'))} vivid=${m.duration($('#vivid'))} sw=${m.duration($('#sw-host'))} body=${m.duration()}`) })
  expect(trace).toMatchSnapshot()
})

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
