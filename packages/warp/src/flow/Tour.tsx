import { announce, coachSpot, tourSpot, uid } from '@weft-js/warp-core'
import { derived, state, untrack, watch, type State } from '@weft-js/core'
import { Button } from '../Button'
import { bindable } from '../Picker'
import { use } from '@weft-js/warp-core/weft'
import '../styles'
import '@weft-js/warp-core/styles/flows/tokens.css'
import '@weft-js/warp-core/styles/flows/base.css'
import '@weft-js/warp-core/styles/components/tour.css'
import '@weft-js/warp-core/styles/flows/tour.css'

/** One stop of a tour. */
export interface TourStep {
  /** A CSS selector: `[data-tour=new]`. */
  target: string
  title: unknown
  body: unknown
  /** The target stays pressable ("Try it: click New"). */
  interactive?: boolean | undefined
}

/** Props for Tour. */
export interface TourProps {
  id?: string
  steps: TourStep[]
  open?: State<boolean> | boolean
  /** Ran to the end. */
  onDone?: () => void
  /** Skip or Escape. */
  onSkip?: () => void
  onStepChange?: ((index: number) => void) | undefined
}

function Running({ steps, onEnd, onStepChange }: { steps: TourStep[]; onEnd: (done: boolean) => void; onStepChange?: ((i: number) => void) | undefined }) {
  const id = uid('tour')
  const list = untrack(() => steps)
  const at = state(0)
  const way = state(1)
  const step = derived(() => list[at.value])
  const many = list.length > 1
  const go = (i: number, dir = 1) => {
    way.value = dir
    if (i < 0) return
    if (i >= list.length) return onEnd(true)
    at.value = i
    onStepChange?.(i)
  }
  watch(() => at.value, i => { if (typeof document === 'object') announce(document, `${many ? `Step ${i + 1} of ${list.length}. ` : ''}${typeof list[i]!.title === 'string' ? list[i]!.title : ''}`) })
  let root: HTMLDivElement | undefined
  use(tourSpot, () => root, () => ({
    target: step.value!.target, step: at.value, interactive: step.value!.interactive,
    onNext: () => go(at.value + 1), onPrev: () => go(at.value - 1, -1), onClose: () => onEnd(false),
    onMissing: () => (way.value < 0 && at.value === 0 ? onEnd(false) : go(at.value + way.value, way.value)),
    onBlocked: () => onEnd(false),
  }))
  return (
    <div ref={n => (root = n)} data-scope="tour">
      <div data-part="spotlight" data-sweep="" data-hold=""><span data-part="sweep-base" aria-hidden="true"></span><span data-part="sweep" aria-hidden="true"></span></div>
      <div data-part="card" role="dialog" aria-modal="false" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}>
        <span data-part="step-count">{many ? `Step ${at.value + 1} of ${list.length}` : 'Tip'}</span>
        <h4 id={`${id}-t`} tabindex="-1" aria-level="2">{step.value!.title}</h4>
        <p id={`${id}-d`}>{step.value!.body}</p>
        <footer>
          <span data-part="pips" aria-hidden="true">{many && list.map((s, i) => <i key={s.target} data-on={i === at.value ? '' : undefined}></i>)}</span>
          <Button emphasis="ghost" tone="neutral" size="sm" onClick={() => onEnd(false)}>Skip tour</Button>
          {at.value > 0 && <Button emphasis="ghost" tone="neutral" size="sm" onClick={() => go(at.value - 1, -1)}>Back</Button>}
          <Button size="sm" onClick={() => go(at.value + 1)}>{at.value === list.length - 1 ? 'Done' : 'Next'}</Button>
        </footer>
      </div>
    </div>
  )
}

/**
 * The product tour (09 §3.2): a spotlight cut by the scrim, a ring that draws on arrival, a card beside the target
 * (docked on a phone). A missing target skips its step; it starts only on request and never over another overlay; Esc
 * ends it and focus returns to where it began.
 */
export function Tour({ steps, open, onDone, onSkip, onStepChange }: TourProps) {
  const on = bindable<boolean>(() => open, () => false, false)
  const end = (done: boolean) => {
    on.set(false)
    ;(done ? onDone : onSkip)?.()
  }
  return <>{on.value && <Running steps={steps} onEnd={end} onStepChange={onStepChange} />}</>
}

/** A coachmark (09 §3.2): one tip with no scrim: a beacon on the target, the card on a press. Persisting the dismissal is the app's (`onDismiss`). */
export function Coachmark({ target, title, body, onDismiss }: { target: string; title: unknown; body: unknown; onDismiss?: () => void }) {
  const id = uid('coach')
  const open = state(false)
  const gone = state(false)
  let root: HTMLDivElement | undefined
  use(coachSpot, () => root, () => ({ target, open: open.value, onClose: () => (open.value = false) }))
  return (
    <div ref={n => (root = n)} data-scope="tour" hidden={gone.value || undefined}>
      <button type="button" data-scope="button" data-emphasis="ghost" data-tone="neutral" data-size="sm" data-icon-only="" data-beacon="" aria-label="Show tip" aria-expanded={open.value ? 'true' : 'false'} onClick={() => (open.value = !open.value)}><span data-part="beacon" aria-hidden="true"></span></button>
      {open.value && (
        <div data-part="card" role="dialog" aria-modal="false" aria-labelledby={`${id}-t`}>
          <span data-part="step-count">Tip</span>
          <h4 id={`${id}-t`} tabindex="-1" aria-level="2">{title}</h4>
          <p>{body}</p>
          <footer><span data-part="pips"></span><Button size="sm" onClick={() => { open.value = false; gone.value = true; onDismiss?.() }}>Got it</Button></footer>
        </div>
      )}
    </div>
  )
}
