import type { Interaction } from '@weft-js/core/interaction'
import { useUi } from './use-ui'
import { sweepParts } from './Choice-parts'
import './fields'
import '@weft-js/warp-core/styles/inputs/choice-switch.css'

/**
 * A native checkbox with role="switch" (03 §4; SIGNATURE §1c): the rail fills through the sweep as the thumb slides.
 * The whole label is the hover target. Applies at once: never inside a form with Save (03 §8).
 */
export function Switch({
  children,
  hint,
  size,
  placement = 'end',
  ui,
  ...rest
}: {
  checked?: boolean
  hint?: unknown
  size?: 'sm' | 'md' | undefined
  placement?: 'start' | 'end'
  ui?: Interaction
  children?: unknown
  [attr: string]: unknown
}) {
  let host: HTMLLabelElement | undefined
  useUi(
    () => ui,
    () => host,
  )
  return (
    <label
      ref={(n) => (host = n)}
      data-scope="switch"
      data-placement={placement}
      data-size={size === 'sm' ? 'sm' : undefined}
    >
      <input type="checkbox" role="switch" {...rest} />
      <span data-part="track" data-sweep="">
        <span data-part="rail-fill" aria-hidden="true">
          <span data-part="rail-hover"></span>
        </span>
        {sweepParts()}
        <span data-part="thumb" aria-hidden="true"></span>
      </span>
      <span data-part="label">{children}</span>
      {hint !== undefined && <span data-part="hint">{hint}</span>}
    </label>
  )
}
