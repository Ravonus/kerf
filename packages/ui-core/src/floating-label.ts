// The floating border label (SIGNATURE §2, 01-foundations §2 "Label anatomy"), ported from the specimens
// (warp-sweep.js label(), inputs.html floatingLabel / delays / notch).
//
//   <label data-part="label" for="…"><span data-part="label-text">Email address</span>
//     <span data-part="label-chars" aria-hidden="true"><span data-char data-c="E"></span>…</span></label>
//
// The visually hidden label-text is the accessible name; the letters are generated content (warp.css), so the
// per-character tint travels without ever spelling the name out. A binding renders this anatomy itself (so it is in
// the server HTML) from labelChars(); the floatingLabel() action only measures: the per-character delays (--d) and
// the notch (what is behind the field, painted under the label), and keeps data-filled on the control in step.
import { installSweep } from './sweep'

// One span per grapheme cluster (emoji, combining marks, Indic conjuncts stay whole), or per word in joining
// scripts, where splitting letters would break the joins. Code points are the fallback without Intl.Segmenter.
const JOINING = /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mongolian}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}\p{Script=Mandaic}]/u

/** The label's letters, as the anatomy renders them (one `<span data-char data-c>` each). */
export function labelChars(text: string): string[] {
  const clean = text.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
  if (typeof Intl === 'undefined' || !Intl.Segmenter) return [...clean]
  const seg = new Intl.Segmenter(undefined, { granularity: JOINING.test(clean) ? 'word' : 'grapheme' })
  return Array.from(seg.segment(clean), s => s.segment)
}

const parts = (field: Element) => {
  const box = field.querySelector<HTMLElement>(':scope > [data-part="control"]')
  const label = box?.querySelector<HTMLElement>(':scope > [data-part="label"]')
  return { box, label }
}

// resolve a token in place: a hidden probe in `el` with `prop: expr`
function probe(el: Element, prop: string, expr: string) {
  const t = el.ownerDocument.createElement('i')
  t.style.cssText = `position:absolute;visibility:hidden;${prop}:${expr}`
  el.append(t)
  const cs = getComputedStyle(t)
  const v = parseFloat((cs as any)[prop.replace(/-(\w)/g, (_, c) => c.toUpperCase())])
  t.remove()
  return v || 0
}

// each letter starts when the sweep reaches it: its offset across the control, as a share of the sweep's duration
function delays(field: Element) {
  const { box, label } = parts(field)
  if (!box || !label) return
  const dur = installSweep(field.ownerDocument).duration(box) || 620
  const w = box.offsetWidth
  if (!w) return
  for (const c of label.querySelectorAll<HTMLElement>('[data-char]')) c.style.setProperty('--d', `${Math.max(0, ((label.offsetLeft + c.offsetLeft) / w) * dur).toFixed(0)}ms`)
}

// a computed colour's alpha: browsers serialize it as rgba(r, g, b, a) for sRGB (transparent is rgba(0, 0, 0, 0)) and
// as "… / a)" for every other space (color(), oklch(), color-mix() results); anything else is opaque. Rounded to 8
// bits, as the canvas read it once was (so 0.99 still counts as see-through)
function alpha(c: string) {
  const m = /^rgba\(.*,\s*([\d.]+)\)$|\/\s*([\d.]+)(%?)\s*\)$/.exec(c)
  return m ? Math.round((+(m[1] ?? m[2]) / (m[3] ? 100 : 1)) * 255) / 255 : 1
}
const docOffset = (el: HTMLElement) => {
  let x = 0, y = 0
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft + (n === el ? 0 : n.clientLeft)
    y += n.offsetTop + (n === el ? 0 : n.clientTop)
  }
  return [x, y]
}

// the notch shows exactly what is behind the field: a colour, or a pixel-aligned window onto a gradient or image
function notch(field: Element) {
  const { box, label } = parts(field)
  if (!box || !label) return
  let anc = field.parentElement
  for (; anc; anc = anc.parentElement) {
    const cs = getComputedStyle(anc)
    if ((cs.backgroundImage !== 'none' && !anc.classList.contains('diagram')) || alpha(cs.backgroundColor) >= 0.99) break
  }
  if (!anc) return
  const cs = getComputedStyle(anc)
  let base = cs.backgroundColor
  for (let n: HTMLElement | null = anc; n && alpha(base) < 0.99; n = n.parentElement) base = getComputedStyle(n).backgroundColor
  label.style.setProperty('--_notch-color', base)
  if (cs.backgroundImage === 'none' || anc.offsetWidth < 4) {
    for (const k of ['--_notch-image', '--_notch-size', '--_notch-pos']) label.style.removeProperty(k)
    return
  }
  const [ax, ay] = docOffset(anc), [bx, by] = docOffset(box)
  const lx = bx - ax - anc.clientLeft + probe(box, 'width', 'var(--warp-pad-control)') - 4
  const ly = by - ay - anc.clientTop + probe(box, 'margin-left', 'var(--warp-label-float-offset)')
  label.style.setProperty('--_notch-image', cs.backgroundImage)
  label.style.setProperty('--_notch-size', `${anc.clientWidth}px ${anc.clientHeight}px`)
  label.style.setProperty('--_notch-pos', `${-lx}px ${-ly}px`)
}

/**
 * Action on a `[data-scope="field"]`: measures the label's per-character delays and notch after layout, again when
 * the label's size settles (font swap, float) or the field resizes, and keeps `data-filled` on the control in step
 * with the input's value.
 */
export function floatingLabel(field: HTMLElement) {
  const { box, label } = parts(field)
  if (!box || !label) return { update() {}, destroy() {} }
  const win = field.ownerDocument.defaultView!
  const input = box.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-part="input"]')
  const fill = () => {
    if (!input) return
    if (input instanceof win.HTMLSelectElement) box.toggleAttribute('data-filled', !!input.value || !!input.selectedOptions[0]?.text)
    else if (!box.querySelector('[data-scope="tag"]')) box.toggleAttribute('data-filled', input.value.length > 0)
  }
  const measure = () => { delays(field); notch(field) }
  const onSize = (e: TransitionEvent) => { if (e.propertyName === 'font-size') delays(field) }
  label.addEventListener('transitionend', onSize)
  input?.addEventListener('input', fill)
  input?.addEventListener('change', fill)
  let frame = win.requestAnimationFrame(measure)
  const resize = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(() => { win.cancelAnimationFrame(frame); frame = win.requestAnimationFrame(measure) }) : null
  resize?.observe(box)
  return {
    /** Re-measure (after a dial change) and re-read the value (after a programmatic write). */
    update() { fill(); measure() },
    destroy() {
      win.cancelAnimationFrame(frame)
      resize?.disconnect()
      label.removeEventListener('transitionend', onSize)
      input?.removeEventListener('input', fill)
      input?.removeEventListener('change', fill)
    },
  }
}

/**
 * The field shell's behaviour (03 §1; inputs.html:1089-1110, 1688) as one action on `[data-scope="field"]`: the
 * floating label, the clear button (empties, fires input, refocuses), a press anywhere on the control focuses the
 * input, the counter (`n/max`, data-level near ≥ 90% / over), and for a textarea Cmd/Ctrl+Enter submits its form and
 * it grows with its content where `field-sizing` isn't supported.
 */
export function field(el: HTMLElement) {
  const label = floatingLabel(el)
  const box = el.querySelector<HTMLElement>(':scope > [data-part="control"]')
  const input = box?.querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-part="input"]')
  const counter = el.querySelector<HTMLElement>('[data-part="counter"]')
  const max = Number(el.dataset.counter) || 0
  const count = () => {
    if (!counter || !input || !max) return
    const n = input.value.length
    const text = `${n}/${max}`
    if (counter.textContent !== text) counter.textContent = text
    if (n > max) counter.dataset.level = 'over'
    else if (n >= max * 0.9) counter.dataset.level = 'near'
    else delete counter.dataset.level
  }
  const grows = input instanceof HTMLTextAreaElement && !(globalThis.CSS?.supports?.('field-sizing', 'content') ?? true)
  const grow = () => { if (grows && input) { input.style.height = 'auto'; input.style.height = `${input.scrollHeight + 2}px` } }
  const onInput = () => { count(); grow() }
  const onClick = (e: MouseEvent) => {
    if (!(e.target as Element).closest('[data-part="clear"]') || !input) return
    input.value = ''
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.focus()
  }
  const onDown = (e: PointerEvent) => {
    const t = e.target as Element
    if (!input || t.closest('input, textarea, select, button, [data-scope="popup"], [data-scope="tag"], [data-part="scrub"]')) return
    e.preventDefault()
    input.focus()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && input instanceof HTMLTextAreaElement) input.form?.requestSubmit()
  }
  box?.addEventListener('click', onClick)
  box?.addEventListener('pointerdown', onDown)
  input?.addEventListener('input', onInput)
  input?.addEventListener('keydown', onKey as EventListener)
  count()
  grow()
  return {
    update() { label.update(); count(); grow() },
    destroy() {
      label.destroy()
      box?.removeEventListener('click', onClick)
      box?.removeEventListener('pointerdown', onDown)
      input?.removeEventListener('input', onInput)
      input?.removeEventListener('keydown', onKey as EventListener)
    },
  }
}
