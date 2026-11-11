import { paintStrokes, signatureSvg, strokeWidth, type Stroke } from '@kerf/veneer-core'
import { derived, flush, state, untrack } from '@kerf/core'
import { use } from '@kerf/veneer-core/kerf'
import type { bindable } from '../Picker'
import type { SignatureValue } from '../SignaturePad'

type Held = ReturnType<typeof bindable<SignatureValue | null>>
function signatureData(start: SignatureValue | null) {
  const strokes = state<Stroke[]>(start?.strokes ?? [])
  const typed = state(start?.text ?? '')
  const method = state<'draw' | 'type'>(start?.method === 'typed' ? 'type' : 'draw')
  const count = derived(() => strokes.value.length)
  const has = derived(() =>
    method.value === 'draw' ? count.value > 0 : typed.value.trim().length > 0,
  )
  const name = derived(() =>
    method.value === 'type'
      ? 'Typed signature'
      : count.value
        ? `Signature, ${count.value} stroke${count.value === 1 ? '' : 's'}`
        : 'Signature, empty',
  )
  const status = derived(() =>
    !has.value
      ? 'Empty'
      : method.value === 'type'
        ? 'Typed'
        : `${count.value} stroke${count.value === 1 ? '' : 's'} · drawn`,
  )
  const refs: {
    pad?: HTMLDivElement | undefined
    canvas?: HTMLCanvasElement | undefined
    box?: HTMLInputElement | undefined
    cur: Stroke | null
    last: { x: number; y: number; t: number; w: number }
  } = { cur: null, last: { x: 0, y: 0, t: 0, w: 2.6 } }
  return { strokes, typed, method, count, has, name, status, refs }
}
type Data = ReturnType<typeof signatureData>
function signatureDraw(d: Data) {
  const { refs, strokes } = d
  const draw = () => {
    const ctx = refs.canvas?.getContext?.('2d')
    if (!ctx) return
    const dpr = devicePixelRatio || 1,
      r = refs.pad!.getBoundingClientRect()
    if (
      refs.canvas!.width !== Math.round(r.width * dpr) ||
      refs.canvas!.height !== Math.round(r.height * dpr)
    ) {
      refs.canvas!.width = Math.max(1, Math.round(r.width * dpr))
      refs.canvas!.height = Math.max(1, Math.round(r.height * dpr))
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.strokeStyle = ctx.fillStyle = getComputedStyle(refs.pad!).color
    paintStrokes(ctx, strokes.value, r.width, r.height)
  }
  return draw
}
function signatureEmit(d: Data, v: Held) {
  const { has, method, strokes, typed } = d
  const emit = () => {
    if (!has.value) return v.set(null, 'programmatic')
    if (method.value === 'draw')
      v.set(
        { method: 'drawn', strokes: strokes.value, svg: signatureSvg(strokes.value) },
        'pointer',
      )
    else {
      const text = typed.value.trim()
      v.set(
        {
          method: 'typed',
          text,
          svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200"><text x="24" y="130" font-size="64" font-style="italic" fill="currentColor">${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)}</text></svg>`,
        },
        'keyboard',
      )
    }
  }
  return emit
}
function signatureEvents(d: Data, draw: () => void, emit: () => void) {
  const { refs, strokes, typed, method } = d
  const down = (e: PointerEvent) => {
    if (method.value !== 'draw') return
    refs.canvas!.setPointerCapture?.(e.pointerId)
    const r = refs.canvas!.getBoundingClientRect()
    refs.cur = [
      [
        (e.clientX - r.left) / r.width,
        (e.clientY - r.top) / r.height,
        e.pointerType === 'pen' && e.pressure ? 1 + e.pressure * 3 : 2.6,
      ],
    ]
    strokes.value = [...strokes.value, refs.cur]
    refs.last = { x: e.clientX, y: e.clientY, t: e.timeStamp, w: 2.6 }
    draw()
  }
  const move = (e: PointerEvent) => {
    if (!refs.cur) return
    const r = refs.canvas!.getBoundingClientRect()
    for (const ev of e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e]) {
      const speed =
        Math.hypot(ev.clientX - refs.last.x, ev.clientY - refs.last.y) /
        Math.max(1, ev.timeStamp - refs.last.t)
      const w = strokeWidth(refs.last.w, speed, ev.pointerType === 'pen' ? ev.pressure : undefined)
      refs.cur.push([(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height, w])
      refs.last = { x: ev.clientX, y: ev.clientY, t: ev.timeStamp, w }
    }
    draw()
  }
  const up = () => {
    if (refs.cur) {
      refs.cur = null
      strokes.value = [...strokes.value]
      emit()
    }
  }
  const undo = () => {
    strokes.value = strokes.value.slice(0, -1)
    flush()
    draw()
    emit()
  }
  const clear = () => {
    if (method.value === 'draw') strokes.value = []
    else typed.value = ''
    flush()
    draw()
    emit()
  }
  const pick = (m: 'draw' | 'type') => {
    method.value = m
    flush()
    if (m === 'type') refs.box?.focus()
    else draw()
    emit()
  }
  return { down, move, up, undo, clear, pick }
}
function bindSignature(d: Data, draw: () => void) {
  const { refs } = d
  use(
    (el: HTMLDivElement) => {
      const size = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(draw)
      size?.observe(el)
      const theme = new MutationObserver(() => requestAnimationFrame(draw))
      theme.observe(el.ownerDocument.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme', 'data-expression'],
      })
      return {
        update() {},
        destroy() {
          size?.disconnect()
          theme.disconnect()
        },
      }
    },
    () => refs.pad,
  )
}
export function signatureState(v: Held) {
  const start = untrack(() => v.value)
  const data = signatureData(start)
  const draw = signatureDraw(data)
  const emit = signatureEmit(data, v)
  const events = signatureEvents(data, draw, emit)
  bindSignature(data, draw)
  return { ...data, ...events, start, draw, emit }
}
