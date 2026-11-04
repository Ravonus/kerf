import { contextLevel, formatTokens } from '@weft-js/warp-core'
import { derived } from '@weft-js/core'
import { Button } from '../Button'
import { Tooltip } from '../Tooltip'
import '../styles'
import '@weft-js/warp-core/styles/app/context-meter.css'

/** How full the context window is, and optionally what with. */
export type ContextUse = {
  used: number
  limit: number
  parts?: { label: string; tokens: number }[] | undefined
}

/**
 * ContextMeter (07 §1.2): a ring and a number, caution at 80%, critical at 95%, where `onCompact` offers /compact. The
 * tooltip lists what fills it. `showTokens` adds the count beside the percent.
 */
export function ContextMeter({
  used,
  limit,
  parts,
  showTokens,
  onCompact,
}: ContextUse & { showTokens?: boolean; onCompact?: (() => void) | undefined }) {
  const ratio = derived(() => Math.min(1, limit > 0 ? used / limit : 0))
  const level = derived(() => contextLevel(ratio.value))
  const pct = derived(() => Math.round(ratio.value * 100))
  const tip = derived(() =>
    [
      `${formatTokens(used)} of ${formatTokens(limit)} tokens`,
      ...(parts ?? []).map((p) => `${p.label} ${formatTokens(p.tokens)}`),
    ].join(' · '),
  )
  return (
    <>
      <Tooltip content={tip.value}>
        <span
          data-scope="context-meter"
          data-level={level.value}
          role="meter"
          tabindex="0"
          aria-label="Context used"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={pct.value}
          aria-valuetext={`${pct.value}%, ${formatTokens(used)} of ${formatTokens(limit)} tokens`}
          style={`--_v:${ratio.value}`}
        >
          <svg viewBox="0 0 36 36" aria-hidden="true">
            <circle
              cx="18"
              cy="18"
              r="15.9"
              stroke="var(--warp-color-surface-active)"
              pathLength="100"
            />
            <circle cx="18" cy="18" r="15.9" pathLength="100" />
          </svg>
          <span>{showTokens ? `${pct.value}% · ${formatTokens(used)}` : `${pct.value}%`}</span>
        </span>
      </Tooltip>
      {level.value && onCompact && (
        <Button emphasis="link" tone="neutral" size="sm" onClick={onCompact}>
          /compact
        </Button>
      )}
    </>
  )
}
