import { paintStrokes, signatureSvg, strokeWidth, uid, type Stroke } from '@weft/ui-core'
import { derived, flush, state, untrack } from 'weft'
import { Button } from './Button'
import { Field, type FieldProps } from './Field'
import { Icon } from './Icon'
import { bindable, type Bindable } from './Picker'
import { use } from './use'
import '@weft/ui-core/styles/rich/signature.css'

export type SignatureValue = { method: 'drawn' | 'typed'; strokes?: Stroke[]; text?: string; svg: string }
export type SignaturePadProps = Omit<FieldProps, 'value' | 'defaultValue'> & Bindable<SignatureValue | null>

/**
 * SignaturePad (04 §4): a canvas redrawn from its stored points on resize and theme change, with Undo and Clear. Typing
 * the name is the mandatory alternative (WCAG 2.1.1, 2.5.1), so keyboard and switch users can sign.
 */
export function SignaturePad({ value, defaultValue, onValueChange, label, hint, ...rest }: SignaturePadProps) {
  const id = uid('sig')
  const v = bindable<SignatureValue | null>(() => value, () => defaultValue, null, () => onValueChange)
  const start = untrack(() => v.value)
  const strokes = state<Stroke[]>(start?.strokes ?? [])
  const typed = state(start?.text ?? '')
  const method = state<'draw' | 'type'>(start?.method === 'typed' ? 'type' : 'draw')
  const count = derived(() => strokes.value.length)
  const has = derived(() => (method.value === 'draw' ? count.value > 0 : typed.value.trim().length > 0))
  const name = derived(() => (method.value === 'type' ? 'Typed signature' : count.value ? `Signature, ${count.value} stroke${count.value === 1 ? '' : 's'}` : 'Signature, empty'))
  const status = derived(() => (!has.value ? 'Empty' : method.value === 'type' ? 'Typed' : `${count.value} stroke${count.value === 1 ? '' : 's'} · drawn`))
  let pad: HTMLDivElement | undefined
  let canvas: HTMLCanvasElement | undefined
  let box: HTMLInputElement | undefined
  let cur: Stroke | null = null
  let last = { x: 0, y: 0, t: 0, w: 2.6 }
  const draw = () => {
    const ctx = canvas?.getContext?.('2d')
    if (!ctx) return
    const dpr = devicePixelRatio || 1, r = pad!.getBoundingClientRect()
    if (canvas!.width !== Math.round(r.width * dpr) || canvas!.height !== Math.round(r.height * dpr)) { canvas!.width = Math.max(1, Math.round(r.width * dpr)); canvas!.height = Math.max(1, Math.round(r.height * dpr)) }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.strokeStyle = ctx.fillStyle = getComputedStyle(pad!).color
    paintStrokes(ctx, strokes.value, r.width, r.height)
  }
  const emit = () => {
    if (!has.value) return v.set(null, 'programmatic')
    if (method.value === 'draw') v.set({ method: 'drawn', strokes: strokes.value, svg: signatureSvg(strokes.value) }, 'pointer')
    else { const text = typed.value.trim(); v.set({ method: 'typed', text, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200"><text x="24" y="130" font-size="64" font-style="italic" fill="currentColor">${text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)}</text></svg>` }, 'keyboard') }
  }
  const down = (e: PointerEvent) => {
    if (method.value !== 'draw') return
    canvas!.setPointerCapture?.(e.pointerId)
    const r = canvas!.getBoundingClientRect()
    cur = [[(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, e.pointerType === 'pen' && e.pressure ? 1 + e.pressure * 3 : 2.6]]
    strokes.value = [...strokes.value, cur]
    last = { x: e.clientX, y: e.clientY, t: e.timeStamp, w: 2.6 }
    draw()
  }
  const move = (e: PointerEvent) => {
    if (!cur) return
    const r = canvas!.getBoundingClientRect()
    for (const ev of e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e]) {
      const speed = Math.hypot(ev.clientX - last.x, ev.clientY - last.y) / Math.max(1, ev.timeStamp - last.t)
      const w = strokeWidth(last.w, speed, ev.pointerType === 'pen' ? ev.pressure : undefined)
      cur.push([(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height, w])
      last = { x: ev.clientX, y: ev.clientY, t: ev.timeStamp, w }
    }
    draw()
  }
  const up = () => { if (cur) { cur = null; strokes.value = [...strokes.value]; emit() } }
  const undo = () => { strokes.value = strokes.value.slice(0, -1); flush(); draw(); emit() }
  const clear = () => { if (method.value === 'draw') strokes.value = []; else typed.value = ''; flush(); draw(); emit() }
  const pick = (m: 'draw' | 'type') => { method.value = m; flush(); if (m === 'type') box?.focus(); else draw(); emit() }
  use((el: HTMLDivElement) => {
    const size = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(draw)
    size?.observe(el)
    const theme = new MutationObserver(() => requestAnimationFrame(draw))
    theme.observe(el.ownerDocument.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-expression'] })
    return { update() {}, destroy() { size?.disconnect(); theme.disconnect() } }
  }, () => pad)
  return (
    <div data-scope="signature" class="stack">
      <div class="row" style="justify-content:flex-end">
        <div class="seg" role="radiogroup" aria-label="Signing method">
          <label><input type="radio" name={`${id}-m`} checked={method.value === 'draw'} onChange={() => pick('draw')} /><i>Draw</i></label>
          <label><input type="radio" name={`${id}-m`} checked={method.value === 'type'} onChange={() => pick('type')} /><i>Type</i></label>
        </div>
      </div>
      <Field
        {...rest}
        group
        label={label}
        hint={hint ?? 'Draw with a finger, a pen or a mouse, or switch to Type.'}
        filled={has.value}
        control={() => (
          <div ref={(n: any) => (pad = n)} data-part="pad">
            <canvas ref={(n: any) => (canvas = n)} role="img" aria-label={name.value} style={method.value === 'type' ? 'visibility:hidden' : undefined} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}></canvas>
            <span data-part="empty"></span>
            <span data-part="baseline" aria-hidden="true">×</span>
            <input ref={(n: any) => (box = n)} data-part="typed" hidden={method.value !== 'type'} aria-label="Type your full name" placeholder="Type your full name" autocomplete="name" value={typed.value} onInput={e => { typed.value = (e.currentTarget as HTMLInputElement).value; emit() }} />
          </div>
        )}
      />
      <div class="row" style="justify-content:space-between">
        <span class="muted" aria-live="polite">{status.value}</span>
        <span class="row">
          {method.value === 'draw' && <Button emphasis="ghost" size="sm" icon="undo" disabled={!count.value} onClick={undo}>Undo</Button>}
          <Button emphasis="ghost" size="sm" icon="x" disabled={!has.value} onClick={clear}>Clear</Button>
        </span>
      </div>
    </div>
  )
}
