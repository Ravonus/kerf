import { untrack } from 'weft'
import type { Tone } from './Button'
import './styles'
import '@weft/warp-core/styles/components/progress.css'

/**
 * Progress (05 §5): linear, or `shape="circle"`. Without a `value` it is indeterminate. The range moves through
 * the rail with clip-path on the sweep curve; `--_v` is the only thing a value change writes.
 */
export function Progress({ label, value, shape, tone, showValue = true }: { label: string; value?: number; shape?: 'linear' | 'circle'; tone?: Tone; showValue?: boolean }) {
  const pct = () => (value === undefined ? undefined : Math.max(0, Math.min(100, value)))
  const v = () => (pct() === undefined ? undefined : `--_v:${pct()! / 100}`)
  if (untrack(() => shape) === 'circle')
    return (
      <div data-scope="progress" data-shape="circle" data-tone={tone} role="progressbar" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct() === undefined ? undefined : Math.round(pct()!)} data-state={value === undefined ? 'indeterminate' : undefined} style={v()}>
        <svg viewBox="0 0 36 36" aria-hidden="true"><circle data-part="track" cx="18" cy="18" r="15.9155" pathLength="100" /><circle data-part="range" cx="18" cy="18" r="15.9155" pathLength="100" /></svg>
        {showValue && value !== undefined && <span data-part="value-text">{Math.round(pct()!)}</span>}
      </div>
    )
  return (
    <div data-scope="progress" data-part="root" data-tone={tone} role="progressbar" aria-label={label} aria-valuemin={value === undefined ? undefined : '0'} aria-valuemax={value === undefined ? undefined : '100'} aria-valuenow={pct() === undefined ? undefined : Math.round(pct()!)} aria-valuetext={value === undefined ? label : undefined} data-state={value === undefined ? 'indeterminate' : undefined} style={v()}>
      <div data-part="label-row"><span>{label}</span><span data-part="value-text">{value === undefined ? '—' : `${Math.round(pct()!)}%`}</span></div>
      <div data-part="track"><div data-part="range"></div></div>
    </div>
  )
}
