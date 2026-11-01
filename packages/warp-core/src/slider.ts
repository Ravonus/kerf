// A slider on one or two thumbs (03 §5; inputs.html slider()): role=slider thumbs, keyboard per APG, pointer anywhere on
// the track. The binding renders the parts; this writes --_v, --_v0, --_v1 and the ARIA values.
import { formReset } from './form'

export interface SliderOptions {
  values: number[]
  min: number
  max: number
  step: number
  format(v: number): string
  names?: string[]
  disabled?: boolean
  onChange(values: number[]): void
}

export function slider(el: HTMLElement, opts: SliderOptions) {
  let o = opts
  let vals = [...o.values]
  const thumbs = () => [...el.querySelectorAll<HTMLElement>(':scope > [data-part="thumb"]')]
  const pct = (v: number) => (v - o.min) / (o.max - o.min)
  // the nearest step that exists: the last may fall short of max; toPrecision drops binary noise (0.1 + 0.2)
  const snap = (v: number) => {
    const last = Math.floor((o.max - o.min) / o.step + 1e-9)
    const n = Math.min(last, Math.max(0, Math.round((v - o.min) / o.step)))
    return Number((n * o.step + o.min).toPrecision(15))
  }
  function paint() {
    thumbs().forEach((t, i) => {
      t.style.setProperty('--_v', String(pct(vals[i])))
      t.setAttribute('aria-valuenow', String(vals[i]))
      const text = o.format(vals[i])
      t.setAttribute('aria-valuetext', o.names?.[i] && vals.length > 1 ? `${o.names[i]}, ${text}` : text)
      const bubble = t.querySelector('[data-part="bubble"]')
      if (bubble) bubble.textContent = text
    })
    el.style.setProperty('--_v0', String(vals.length === 2 ? pct(vals[0]) : 0))
    el.style.setProperty('--_v1', String(pct(vals.at(-1)!)))
  }
  function set(i: number, v: number) {
    let next = snap(v)
    if (vals.length === 2) next = i === 0 ? Math.min(next, vals[1]) : Math.max(next, vals[0])
    if (next === vals[i]) return
    vals = vals.with(i, next)
    paint()
    o.onChange(vals)
  }
  const at = (x: number) => {
    const r = el.querySelector('[data-part="track"]')!.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (x - r.left) / r.width))
    return o.min + (getComputedStyle(el).direction === 'rtl' ? 1 - f : f) * (o.max - o.min)
  }
  const onDown = (e: PointerEvent) => {
    if (o.disabled) return
    const v = at(e.clientX)
    const i = vals.length === 2 && Math.abs(v - vals[1]) < Math.abs(v - vals[0]) ? 1 : 0
    const t = thumbs()[i]
    e.preventDefault()
    t.focus({ preventScroll: true })
    t.setAttribute('data-dragging', '')
    el.setPointerCapture?.(e.pointerId)
    set(i, v)
    const move = (ev: PointerEvent) => set(i, at(ev.clientX))
    const up = () => {
      t.removeAttribute('data-dragging')
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }
  const onKey = (e: KeyboardEvent) => {
    const i = thumbs().indexOf(e.target as HTMLElement)
    if (i < 0 || o.disabled) return
    const big = Math.max(o.step, (o.max - o.min) / 10)
    // the arrows go the way they point: the track runs right to left in RTL
    const along = getComputedStyle(el).direction === 'rtl' ? -o.step : o.step
    const d = ({ ArrowRight: along, ArrowUp: o.step, ArrowLeft: -along, ArrowDown: -o.step, PageUp: big, PageDown: -big } as Record<string, number>)[e.key]
    if (d !== undefined) { e.preventDefault(); set(i, vals[i] + d) }
    if (e.key === 'Home') { e.preventDefault(); set(i, o.min) }
    if (e.key === 'End') { e.preventDefault(); set(i, o.max) }
  }
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('keydown', onKey)
  // the binding holds the value: a form's reset goes back to the first one through onChange
  const first = vals
  const reset = formReset(el, () => { vals = first; paint(); o.onChange(vals) })
  paint()
  return {
    update(next: SliderOptions) { o = next; vals = [...o.values]; paint() },
    destroy() {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('keydown', onKey)
      reset.destroy()
    },
  }
}
