import { indicator, uid } from '@weft-js/warp-core'
import { untrack } from '@weft-js/core'
import { Icon, type IconRef } from './Icon'
import { use } from '@weft-js/warp-core/weft'
import './fields'
import '@weft-js/warp-core/styles/inputs/choice-segmented.css'

/** One Segmented choice. */
export type SegmentedOption<V extends string> = {
  value: V
  label: unknown
  icon?: IconRef | undefined
  count?: unknown
  disabled?: boolean | undefined
}

/**
 * Segmented (03 §4, review 01 M8): native radios in a group that rests on its ink border; hovering or focusing an
 * unselected option sweeps a ring round that option only; the selected face slides to it on the sweep curve.
 */
export function Segmented<V extends string>({
  label,
  value,
  onChange,
  options,
  size,
  name,
  fill,
}: {
  label: string
  value: V
  onChange: (v: V) => void
  options: SegmentedOption<V>[]
  size?: 'sm' | 'md' | undefined
  name?: string | undefined
  /** Span the container, each option an equal share. */
  fill?: boolean | undefined
}) {
  const group = untrack(() => name) ?? uid('seg')
  let root: HTMLDivElement | undefined
  use(
    indicator,
    () => root,
    () => ({ selected: ':scope > label:has(input:checked)', at: value }),
  )
  return (
    <div
      ref={(n) => (root = n)}
      data-scope="segmented"
      role="radiogroup"
      aria-label={label}
      data-size={size === 'sm' ? 'sm' : undefined}
      data-fill={fill ? '' : undefined}
    >
      <span data-part="indicator" aria-hidden="true" data-instant=""></span>
      {options.map((o) => (
        <label key={o.value} data-sweep="">
          <span data-part="sweep" aria-hidden="true"></span>
          <input
            type="radio"
            name={group}
            value={o.value}
            checked={o.value === value}
            disabled={o.disabled}
            onChange={() => onChange(o.value)}
          />
          <span data-part="item">
            {o.icon && <Icon name={o.icon} />}
            {o.label}
            {o.count !== undefined && <span data-part="count">{o.count}</span>}
          </span>
        </label>
      ))}
    </div>
  )
}
