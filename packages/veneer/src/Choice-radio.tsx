import { uid } from '@kerf/veneer-core'
import { untrack } from '@kerf/core'
import type { Interaction } from '@kerf/core/interaction'
import { useUi } from './use-ui'
import { sweepParts } from './Choice-parts'
import './fields'
import '@kerf/veneer-core/styles/inputs/choice-radio.css'

/** One radio (03 §4): the native input, the sweep ring, a dot that springs in. Use RadioGroup for a set. */
export function Radio({
  children,
  hint,
  ui,
  ...rest
}: {
  hint?: unknown
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
    <label ref={(n) => (host = n)} data-scope="radio">
      <input type="radio" {...rest} />
      <span data-part="control" data-sweep="">
        {sweepParts()}
      </span>
      <span data-part="label">{children}</span>
      {hint !== undefined && <span data-part="hint">{hint}</span>}
    </label>
  )
}

/** One RadioGroup choice. */
export type RadioOption<V extends string> = {
  value: V
  label: unknown
  hint?: unknown
  disabled?: boolean | undefined
}

/** A radio group: native radios, so arrow keys, form values and the group name are the platform's. */
export function RadioGroup<V extends string>({
  label,
  value,
  onChange,
  options,
  name,
}: {
  label: string
  value: V
  onChange: (v: V) => void
  options: RadioOption<V>[]
  name?: string | undefined
}) {
  const group = untrack(() => name) ?? uid('radio')
  return (
    <div role="radiogroup" aria-label={label} style="display:grid;gap:var(--veneer-space-tight)">
      {options.map((o) => (
        <Radio
          key={o.value}
          name={group}
          value={o.value}
          hint={o.hint}
          checked={o.value === value}
          disabled={o.disabled}
          onChange={() => onChange(o.value)}
        >
          {o.label}
        </Radio>
      ))}
    </div>
  )
}
