import type { Interaction } from '@weft-js/core/interaction'
import { use } from '@weft-js/warp-core/weft'
import { useUi } from './use-ui'
import './fields'
import '@weft-js/warp-core/styles/inputs/choice-checkbox.css'

/** A native checkbox (03 §4): the box never fills, the check wipes in, and CSS draws both, so a list of them stays small; `indeterminate` is the real property. */
export function Checkbox({
  children,
  hint,
  error,
  indeterminate,
  ui,
  ...rest
}: {
  checked?: boolean
  indeterminate?: boolean
  hint?: unknown
  error?: unknown
  ui?: Interaction
  children?: unknown
  [attr: string]: unknown
}) {
  let input: HTMLInputElement | undefined
  let host: HTMLLabelElement | undefined
  useUi(
    () => ui,
    () => host,
  )
  use(
    (el: HTMLInputElement, on: boolean | undefined) => {
      el.indeterminate = !!on
      return { update: (v) => void (el.indeterminate = !!v), destroy() {} }
    },
    () => input,
    () => indeterminate,
  )
  return (
    <label ref={(n) => (host = n)} data-scope="checkbox" data-invalid={error ? '' : undefined}>
      <input
        ref={(n) => (input = n)}
        type="checkbox"
        aria-invalid={error ? 'true' : undefined}
        {...rest}
      />
      <span data-part="control" data-sweep="">
        <span data-part="mark" aria-hidden="true"></span>
      </span>
      <span data-part="label">{children}</span>
      {(error ?? hint) !== undefined && <span data-part="hint">{error ?? hint}</span>}
    </label>
  )
}
