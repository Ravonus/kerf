import './styles'
import '@kerf-js/veneer-core/styles/components/streak-indicator.css'

/** A value and the thresholds that change its visual intensity. */
export interface StreakIndicatorProps {
  value: number
  label: string
  thresholds?: readonly number[] | undefined
  /** Colors in order from the default level through the reached thresholds. */
  palette?: readonly string[] | undefined
  detail?: unknown
  reducedMotion?: boolean | undefined
  [attr: string]: unknown
}

/** A labeled count with a glow that grows as its thresholds are reached. */
export function StreakIndicator({
  value,
  label,
  thresholds = [],
  palette,
  detail,
  reducedMotion,
  ...rest
}: StreakIndicatorProps) {
  const level = () => thresholds.filter((threshold) => value >= threshold).length
  return (
    <div {...rest} data-scope="streak-indicator" data-still={reducedMotion ? '' : undefined}>
      <span
        data-part="streak-glow"
        data-active={level() > 0 ? '' : undefined}
        style={{
          '--streak-ink': palette?.[level()],
          '--streak-strength': Math.min(0.5, 0.16 + level() * 0.08),
        }}
        aria-hidden="true"
      ></span>
      <span data-part="streak-label">{label}</span>
      <strong data-part="streak-value">{value}</strong>
      {detail != null && <span data-part="streak-detail">{detail}</span>}
    </div>
  )
}
