import { indicator, uid } from '@weft-js/warp-core'
import { untrack } from '@weft-js/core'
import type { Interaction } from '@weft-js/core/interaction'
import { Icon, type IconRef } from './Icon'
import { use } from '@weft-js/warp-core/weft'
import { useUi } from './use-ui'
import './fields'
import '@weft-js/warp-core/styles/inputs/choice.css'

const sweepParts = () => <><span data-part="sweep-base" aria-hidden="true"></span><span data-part="sweep" aria-hidden="true"></span></>

/**
 * A native checkbox with role="switch" (03 §4; SIGNATURE §1c): the rail fills through the sweep as the thumb slides.
 * The whole label is the hover target. Applies at once: never inside a form with Save (03 §8).
 */
export function Switch({ children, hint, size, placement = 'end', ui, ...rest }: { checked?: boolean; hint?: any; size?: 'sm' | 'md'; placement?: 'start' | 'end'; ui?: Interaction; children?: any; [attr: string]: any }) {
  let host: HTMLLabelElement | undefined
  useUi(() => ui, () => host)
  return (
    <label ref={(n: any) => (host = n)} data-scope="switch" data-placement={placement} data-size={size === 'sm' ? 'sm' : undefined}>
      <input type="checkbox" role="switch" {...rest} />
      <span data-part="track" data-sweep="">
        <span data-part="rail-fill" aria-hidden="true"><span data-part="rail-hover"></span></span>
        {sweepParts()}
        <span data-part="thumb" aria-hidden="true"></span>
      </span>
      <span data-part="label">{children}</span>
      {hint !== undefined && <span data-part="hint">{hint}</span>}
    </label>
  )
}

/** A native checkbox (03 §4): the box never fills, the check draws in; `indeterminate` is the real property. */
export function Checkbox({ children, hint, error, indeterminate, ui, ...rest }: { checked?: boolean; indeterminate?: boolean; hint?: any; error?: any; ui?: Interaction; children?: any; [attr: string]: any }) {
  let input: HTMLInputElement | undefined
  let host: HTMLLabelElement | undefined
  useUi(() => ui, () => host)
  use((el: HTMLInputElement, on: boolean | undefined) => {
    el.indeterminate = !!on
    return { update: v => void (el.indeterminate = !!v), destroy() {} }
  }, () => input, () => indeterminate)
  return (
    <label ref={(n: any) => (host = n)} data-scope="checkbox" data-invalid={error ? '' : undefined}>
      <input ref={(n: any) => (input = n)} type="checkbox" aria-invalid={error ? 'true' : undefined} {...rest} />
      <span data-part="control" data-sweep="">
        {sweepParts()}
        <svg viewBox="0 0 24 24" aria-hidden="true"><path data-part="check" pathLength="1" d="M5 12.5 L9.5 17 L19 7" /><path data-part="dash" pathLength="1" d="M6 12h12" /></svg>
      </span>
      <span data-part="label">{children}</span>
      {(error ?? hint) !== undefined && <span data-part="hint">{error ?? hint}</span>}
    </label>
  )
}

/** One radio (03 §4): the native input, the sweep ring, a dot that springs in. Use RadioGroup for a set. */
export function Radio({ children, hint, ui, ...rest }: { hint?: any; ui?: Interaction; children?: any; [attr: string]: any }) {
  let host: HTMLLabelElement | undefined
  useUi(() => ui, () => host)
  return (
    <label ref={(n: any) => (host = n)} data-scope="radio">
      <input type="radio" {...rest} />
      <span data-part="control" data-sweep="">{sweepParts()}</span>
      <span data-part="label">{children}</span>
      {hint !== undefined && <span data-part="hint">{hint}</span>}
    </label>
  )
}

export type RadioOption<V extends string> = { value: V; label: any; hint?: any; disabled?: boolean }

/** A radio group: native radios, so arrow keys, form values and the group name are the platform's. */
export function RadioGroup<V extends string>({ label, value, onChange, options, name }: { label: string; value: V; onChange: (v: V) => void; options: RadioOption<V>[]; name?: string }) {
  const group = untrack(() => name) ?? uid('radio')
  return (
    <div role="radiogroup" aria-label={label} style="display:grid;gap:var(--warp-space-tight)">
      {options.map(o => <Radio key={o.value} name={group} value={o.value} hint={o.hint} checked={o.value === value} disabled={o.disabled} onChange={() => onChange(o.value)}>{o.label}</Radio>)}
    </div>
  )
}

export type SegmentedOption<V extends string> = { value: V; label: any; icon?: IconRef; count?: any; disabled?: boolean }

/**
 * Segmented (03 §4, review 01 M8): native radios in a group that rests on its ink border; hovering or focusing an
 * unselected option sweeps a ring round that option only; the selected face slides to it on the sweep curve.
 */
export function Segmented<V extends string>({ label, value, onChange, options, size, name }: { label: string; value: V; onChange: (v: V) => void; options: SegmentedOption<V>[]; size?: 'sm' | 'md'; name?: string }) {
  const group = untrack(() => name) ?? uid('seg')
  let root: HTMLDivElement | undefined
  use(indicator, () => root, () => ({ selected: ':scope > label:has(input:checked)', at: value }))
  return (
    <div ref={(n: any) => (root = n)} data-scope="segmented" role="radiogroup" aria-label={label} data-size={size === 'sm' ? 'sm' : undefined}>
      <span data-part="indicator" aria-hidden="true" data-instant=""></span>
      {options.map(o => (
        <label key={o.value} data-sweep="">
          <span data-part="sweep" aria-hidden="true"></span>
          <input type="radio" name={group} value={o.value} checked={o.value === value} disabled={o.disabled} onChange={() => onChange(o.value)} />
          <span data-part="item">{o.icon && <Icon name={o.icon} />}{o.label}{o.count !== undefined && <span data-part="count">{o.count}</span>}</span>
        </label>
      ))}
    </div>
  )
}
