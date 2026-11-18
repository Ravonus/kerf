import { Badge } from './Badge'
import { Progress } from './Progress'
import './styles'
import '@kerf-js/veneer-core/styles/components/locked-tile.css'

/** The locked and unlocked contents of a tile. */
export interface LockedTileProps {
  locked?: boolean | undefined
  label: string
  /** A visible, localized state label. */
  status?: string | undefined
  reason?: unknown
  fallback?: unknown
  icon?: unknown
  progress?: number | undefined
  progressLabel?: string | undefined
  children?: unknown
  [attr: string]: unknown
}

/** A tile that displays an explanation or alternative until its contents are available. */
export function LockedTile({
  locked = true,
  label,
  status,
  reason,
  fallback,
  icon,
  progress,
  progressLabel,
  children,
  ...rest
}: LockedTileProps) {
  return (
    <div
      {...rest}
      data-scope="locked-tile"
      role="group"
      aria-label={label}
      data-state={locked ? 'locked' : 'unlocked'}
    >
      <div data-part="tile-header">
        {icon != null && (
          <span data-part="tile-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <strong>{label}</strong>
        <Badge tone={locked ? 'neutral' : 'positive'}>
          {status ?? (locked ? 'Locked' : 'Unlocked')}
        </Badge>
      </div>
      {locked ? (
        <>
          {reason != null && <div data-part="tile-reason">{reason}</div>}
          {fallback}
          {progress !== undefined && <Progress label={progressLabel ?? label} value={progress} />}
        </>
      ) : (
        children
      )}
    </div>
  )
}
