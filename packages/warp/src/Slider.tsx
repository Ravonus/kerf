import { slider as action, uid } from '@weft-js/warp-core'
import { derived } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'
import './fields'
import '@weft-js/warp-core/styles/inputs/range.css'

/** Props for Slider. */
export interface SliderProps<V extends number | [number, number] = number | [number, number]> {
  label: string
  /** One number, or two for a range. */
  value: V
  onChange: (value: V) => void
  min?: number | undefined
  max?: number | undefined
  step?: number | undefined
  format?: ((v: number) => string) | undefined
  /** A range's thumbs, for screen readers: "Minimum price", "Maximum price". */
  names?: [string, string] | undefined
  disabled?: boolean | undefined
  /** Posts with a form: the number, or one entry per thumb. */
  name?: string | undefined
}

/** A slider (03 §5): role=slider thumbs on warp's rail, keyboard per APG, a pointer anywhere on the track. */
export function Slider<V extends number | [number, number]>({ label, value, onChange, min = 0, max = 100, step = 1, format = String, names, disabled, name }: SliderProps<V>) {
  const id = uid('slider')
  const values = derived<number[]>(() => (typeof value === 'number' ? [value] : value))
  let el: HTMLDivElement | undefined
  use(action, () => el, () => ({ values: values.value, min, max, step, format, names, disabled, onChange: (v: number[]) => onChange((v.length === 1 ? v[0] : v) as V) }))
  return (
    <div style="display:grid;gap:6px">
      <div data-scope="range-head"><span id={`${id}-l`}>{label}</span><output>{values.value.map(format).join(' – ')}</output></div>
      <div ref={n => (el = n)} data-scope="slider" data-disabled={disabled ? '' : undefined}>
        <div data-part="track" data-on=""><div data-part="range"></div></div>
        {values.value.map((v, i) => (
          <div key={i} data-part="thumb" role="slider" tabindex={disabled ? '-1' : '0'} aria-labelledby={`${id}-l`} aria-valuemin={min} aria-valuemax={max} aria-valuenow={v} aria-disabled={disabled ? 'true' : undefined}></div>
        ))}
      </div>
      {name && values.value.map((v, i) => <input key={i} type="hidden" name={name} value={v} />)}
    </div>
  )
}
