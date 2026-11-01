import { slider as action, uid } from '@weft/warp-core'
import { derived } from 'weft'
import { use } from '@weft/warp-core/weft'
import './fields'
import '@weft/warp-core/styles/inputs/range.css'

export interface SliderProps {
  label: string
  /** One number, or two for a range. */
  value: number | [number, number]
  onChange: (value: any) => void
  min?: number
  max?: number
  step?: number
  format?: (v: number) => string
  /** A range's thumbs, for screen readers: "Minimum price", "Maximum price". */
  names?: [string, string]
  disabled?: boolean
  /** Posts with a form: the number, or one entry per thumb. */
  name?: string
}

/** A slider (03 §5): role=slider thumbs on warp's rail, keyboard per APG, a pointer anywhere on the track. */
export function Slider({ label, value, onChange, min = 0, max = 100, step = 1, format = String, names, disabled, name }: SliderProps) {
  const id = uid('slider')
  const values = derived(() => (Array.isArray(value) ? value : [value]))
  let el: HTMLDivElement | undefined
  use(action, () => el, () => ({ values: values.value, min, max, step, format, names, disabled, onChange: (v: number[]) => onChange(v.length === 1 ? v[0] : v) }))
  return (
    <div style="display:grid;gap:6px">
      <div data-scope="range-head"><span id={`${id}-l`}>{label}</span><output>{values.value.map(format).join(' – ')}</output></div>
      <div ref={(n: any) => (el = n)} data-scope="slider" data-disabled={disabled ? '' : undefined}>
        <div data-part="track" data-on=""><div data-part="range"></div></div>
        {values.value.map((v, i) => (
          <div key={i} data-part="thumb" role="slider" tabindex={disabled ? '-1' : '0'} aria-labelledby={`${id}-l`} aria-valuemin={min} aria-valuemax={max} aria-valuenow={v} aria-disabled={disabled ? 'true' : undefined}></div>
        ))}
      </div>
      {name && values.value.map((v, i) => <input key={i} type="hidden" name={name} value={v} />)}
    </div>
  )
}
