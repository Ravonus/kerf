import { stepFlow } from '@weft-js/warp-core'
import { derived, state, untrack, watch, type State } from '@weft-js/core'
import { bindable } from '../Picker'
import { use } from '@weft-js/warp-core/weft'
import '../styles'
import '@weft-js/warp-core/styles/flows/tokens.css'
import '@weft-js/warp-core/styles/flows/base.css'
import '@weft-js/warp-core/styles/flows/flow.css'

/** One step of a Flow. */
export interface FlowStep {
  id: string
  /** Announced on arrival ("Step 2 of 4, Shipping"), and the step's accessible name. */
  label: string
  /** The step's content: built when the step is first reached, then kept, so what was typed survives Back. */
  render: () => unknown
}

/** Props for Flow. */
export interface FlowProps {
  steps: FlowStep[]
  /** The current step's id: a box, a value, or `defaultStep`. */
  step?: State<string> | string
  defaultStep?: string
  onStepChange?: ((id: string) => void) | undefined
  /** Mirror the step in the URL, one history entry a step: `true` for `?step=`, or the parameter's name. */
  history?: boolean | string | undefined
  /** The polite "Step 2 of 4, Shipping" (default true). */
  announce?: boolean | undefined
  [attr: string]: unknown
}

/** Built once, on first arrival: `open` only ever turns true, so nothing is rebuilt as other steps are reached. */
function Body({ open, render }: { open: boolean; render: () => unknown }) {
  const on = derived(() => open)
  return <>{on.value && render()}</>
}

/**
 * The step machine (09 §1.1): steps stacked in one grid cell, so height follows the content. On a change the old step
 * exits, the new one enters from the side it lies on, focus goes to its `[data-autofocus]` or title, the polite region
 * says where you are, and `history` gives each step a URL. A step is live as soon as it mounts: motion never gates it.
 */
export function Flow({ steps, step, defaultStep, onStepChange, history, announce: speak, ...rest }: FlowProps) {
  const list = untrack(() => steps)
  const ids = list.map(s => s.id)
  const at = bindable<string>(() => step, () => defaultStep, ids[0]!, () => onStepChange && (v => onStepChange(v)))
  const param = derived(() => (history === true ? 'step' : history || undefined))
  const seen = state<ReadonlySet<string>>(new Set([untrack(() => at.value)]))
  watch(() => at.value, id => { if (!seen.value.has(id)) seen.value = new Set([...seen.value, id]) })
  let root: HTMLDivElement | undefined
  use(stepFlow, () => root, () => ({ step: at.value, steps: ids, label: (id: string) => list.find(s => s.id === id)?.label, history: param.value, announce: speak, onStep: (id: string) => at.set(id) }))
  return (
    <div ref={n => (root = n)} data-scope="flow" data-dir="forward" {...rest}>
      {list.map(s => (
        <section key={s.id} data-part="step" data-step={s.id} data-state={at.value === s.id ? 'active' : undefined} aria-label={s.label}>
          <Body open={seen.value.has(s.id)} render={s.render} />
        </section>
      ))}
    </div>
  )
}

