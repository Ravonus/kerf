import { derived, onMount, state, watch } from '@kerf-js/core'
import { scratchMask } from '@kerf-js/veneer-core/visuals'
import { surface, type Frame } from '@kerf-js/veneer-core/canvas'
import { use } from '@kerf-js/veneer-core/kerf'
import './styles'
import '@kerf-js/veneer-core/styles/components/scratch-reveal.css'

/** A scratch cover with a native keyboard and tap path. */
export interface ScratchRevealProps {
  /** Accessible name and visible prompt for the reveal button. */
  label: string
  /** CSS color of the cover. */
  cover?: string | undefined
  /** Fraction of distinct cover area to scratch, from 0 to 1. */
  threshold?: number | undefined
  /** Supply to control the reveal externally. */
  revealed?: boolean | undefined
  onReveal?: (() => void) | undefined
  reducedMotion?: boolean | undefined
  children?: unknown
  [attr: string]: unknown
}

type Point = { x: number; y: number }

function point(e: PointerEvent, box: DOMRect): Point {
  return {
    x: Math.max(0, Math.min(1, (e.clientX - box.left) / (box.width || 1))),
    y: Math.max(0, Math.min(1, (e.clientY - box.top) / (box.height || 1))),
  }
}

function scratchGesture(paint: (from: Point, to: Point) => void, reveal: () => void) {
  let contact: { pointer: number; previous: Point; x: number; y: number } | undefined
  let dragged = false
  return {
    onPointerDown(e: PointerEvent) {
      if (!e.isPrimary || e.button !== 0) return
      const target = e.currentTarget as HTMLButtonElement
      const start = point(e, target.getBoundingClientRect())
      dragged = false
      contact = { pointer: e.pointerId, previous: start, x: e.clientX, y: e.clientY }
      target.setPointerCapture(e.pointerId)
    },
    onPointerMove(e: PointerEvent) {
      if (contact?.pointer !== e.pointerId) return
      if (!dragged && Math.hypot(e.clientX - contact.x, e.clientY - contact.y) < 5) return
      dragged = true
      const next = point(e, (e.currentTarget as Element).getBoundingClientRect())
      paint(contact.previous, next)
      contact.previous = next
    },
    onLostPointerCapture() {
      contact = undefined
    },
    onClick(e: MouseEvent) {
      if (!dragged || e.detail === 0) reveal()
      dragged = false
    },
  }
}

/** Scratch by dragging, or reveal immediately with a tap, Enter or Space. */
export function ScratchReveal({
  label,
  cover,
  threshold = 0.25,
  revealed,
  onReveal,
  reducedMotion,
  children,
  ...rest
}: ScratchRevealProps) {
  const local = state(false)
  const revision = state(0)
  const ready = state(false)
  const shown = derived(() => revealed ?? local.value)
  let mask = scratchMask()
  let trigger: HTMLButtonElement | undefined
  let result: HTMLDivElement | undefined
  let ink: string | undefined
  let inkSource: string | undefined
  const refreshInk = () => (ink = undefined)
  const reveal = () => {
    if (shown.value || local.value) return
    local.value = true
    onReveal?.()
  }
  const gesture = scratchGesture((from, to) => {
    if (shown.value) return
    const coverage = mask.stroke(from, to)
    revision.value++
    if (coverage >= Math.min(1, Math.max(0.01, threshold))) reveal()
  }, reveal)
  const painter = derived(() => {
    const painted = revision.value
    const source = cover
    return ({ ctx, width, height }: Frame) => {
      if (ink === undefined || source !== inkSource) ink = getComputedStyle(ctx.canvas).color
      inkSource = source
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = ink
      ctx.fillRect(0, 0, width, height)
      if (painted) mask.erase(ctx, width, height)
      if (!ready.value) ready.value = true
    }
  })
  onMount(() => {
    watch(
      () => shown.value,
      (nowOpen) => {
        if (nowOpen) focusResult(trigger, () => (shown.value ? result : undefined))
      },
    )
    watch(
      () => revealed,
      (controlled, previous) => {
        if (controlled || !previous) return
        mask = scratchMask()
        revision.value = 0
        local.value = false
      },
    )
  })
  return (
    <ScratchSurface
      {...rest}
      label={label}
      cover={cover}
      reducedMotion={reducedMotion}
      open={shown.value}
      ready={ready.value}
      scratched={revision.value > 0}
      draw={painter.value}
      onTheme={refreshInk}
      gesture={gesture}
      setTrigger={(node) => (trigger = node)}
      setResult={(node) => (result = node)}
    >
      {children}
    </ScratchSurface>
  )
}

function focusResult(
  trigger: HTMLButtonElement | undefined,
  result: () => HTMLDivElement | undefined,
) {
  if (trigger && trigger.ownerDocument.activeElement === trigger)
    queueMicrotask(() => result()?.focus({ preventScroll: true }))
}

interface ScratchSurfaceProps extends ScratchRevealProps {
  open: boolean
  ready: boolean
  scratched: boolean
  draw: (frame: Frame) => void
  onTheme: () => void
  gesture: ReturnType<typeof scratchGesture>
  setTrigger: (node: HTMLButtonElement) => void
  setResult: (node: HTMLDivElement) => void
}

function ScratchSurface({
  label,
  cover,
  reducedMotion,
  children,
  open,
  ready,
  scratched,
  draw,
  onTheme,
  gesture,
  setTrigger,
  setResult,
  ...rest
}: ScratchSurfaceProps) {
  let canvas: HTMLCanvasElement | undefined
  use(
    surface,
    () => canvas,
    () => ({ draw, onTheme }),
  )
  return (
    <div
      {...rest}
      data-scope="scratch-reveal"
      data-state={open ? 'open' : undefined}
      data-motion={reducedMotion ? 'reduce' : undefined}
    >
      <div
        data-part="scratch-result"
        ref={setResult}
        tabindex="-1"
        inert={open ? undefined : ''}
        aria-hidden={open ? undefined : 'true'}
      >
        {children}
      </div>
      <button
        {...gesture}
        ref={setTrigger}
        data-part="scratch-cover"
        type="button"
        aria-label={label}
        tabindex={open ? -1 : undefined}
        aria-hidden={open ? 'true' : undefined}
        style={{ '--scratch-ink': cover }}
        data-ready={ready ? '' : undefined}
      >
        <canvas
          ref={(node) => {
            canvas = node
          }}
          aria-hidden="true"
        ></canvas>
        <span
          data-part="scratch-prompt"
          aria-hidden="true"
          data-scratched={scratched ? '' : undefined}
        >
          {label}
        </span>
      </button>
    </div>
  )
}
