import { CheckIcon } from '@weft-js/warp-icons'
import { derived } from '@weft-js/core'
import '../parts'
import '@weft-js/warp-core/styles/rich/helpers.css'
import '@weft-js/warp-core/styles/layout/tokens.css'
import '@weft-js/warp-core/styles/layout/row.css'
import '@weft-js/warp-core/styles/layout/stack.css'
import '@weft-js/warp-core/styles/components/progress.css'

/**
 * Steps (05 §4) with the compact form 09 §6.2 asks for: steps.css hides the list under 520px and shows
 * `[data-part="compact"]`, "Payment, step 4 of 5" over a bar, which parts' Steps doesn't render.
 */
export function StepBar({ label, steps, current, error }: { label: string; steps: { id: string; title: string }[]; current: number; error?: number }) {
  const at = derived(() => Math.min(current, steps.length - 1))
  return (
    <nav data-scope="steps" aria-label={label}>
      <ol>
        {steps.map((s, i) => (
          <li key={s.id} data-part="item" data-state={i === error ? 'error' : i < current ? 'complete' : i === current ? 'current' : undefined} aria-current={i === current ? 'step' : undefined}>
            <span data-part="indicator"><CheckIcon /></span>
            <span data-part="title">{s.title}</span>
          </li>
        ))}
      </ol>
      <div data-part="compact">
        <div data-scope="row" data-justify="between">
          <b data-part="compact-title">{steps[at.value].title}</b>
          <span class="muted">Step {at.value + 1} of {steps.length}</span>
        </div>
        <div data-scope="progress" data-part="root" style={`--_v:${(at.value + 1) / steps.length}`}><div data-part="track"><div data-part="range"></div></div></div>
      </div>
    </nav>
  )
}
