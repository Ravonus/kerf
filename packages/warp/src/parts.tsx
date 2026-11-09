import { CheckIcon } from '@weft-js/warp-icons'
// Small 05 and 02 atoms the app patterns and flows share, each the specimen markup. Internal: not exported from the
// index, so a pack that needs one pays only for its own CSS.
import { derived } from '@weft-js/core'
import type { Tone } from './Button'
import { Icon, toneIcon } from './Icon'
import './styles'
import '@weft-js/warp-core/styles/app/tokens.css'
import '@weft-js/warp-core/styles/app/avatar.css'
import '@weft-js/warp-core/styles/components/badge.css' // the status dot
import '@weft-js/warp-core/styles/components/empty-state.css'
import '@weft-js/warp-core/styles/components/live-status.css'
import '@weft-js/warp-core/styles/components/spinner.css'
import '@weft-js/warp-core/styles/components/steps.css'
import '@weft-js/warp-core/styles/layout/tokens.css'
import '@weft-js/warp-core/styles/layout/banner.css'

/** One path on the 24 grid, for a glyph the shared Icon set doesn't carry. */
export const Glyph = ({ d, ...rest }: { d: string; [attr: string]: unknown }) => (
  <svg data-icon viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...rest}>
    <path d={d} />
  </svg>
)

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

/** Avatar with initials (07 §0); `name` is real text for the row around it, so the circle itself is aria-hidden. */
export function Avatar({
  name,
  size,
  status,
  presence,
  ...rest
}: {
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | undefined
  status?: Tone | undefined
  presence?: number | undefined
  [attr: string]: unknown
}) {
  return (
    <span
      data-scope="avatar"
      data-size={size === 'md' ? undefined : size}
      data-presence={presence}
      aria-hidden="true"
      {...rest}
    >
      {initials(name)}
      {status && <span data-scope="status-dot" data-tone={status}></span>}
    </span>
  )
}

/** Where a live connection stands. */
export type LiveState = 'connecting' | 'live' | 'reconnecting' | 'offline'
const LIVE: Record<LiveState, string> = {
  connecting: 'Connecting',
  live: 'Live',
  reconnecting: 'Reconnecting',
  offline: 'Offline',
}
const DOT: Partial<Record<LiveState, Tone>> = { live: 'positive', offline: 'critical' }

/** The one realtime pill (07 §4.4): quiet while live, loud only in trouble. */
export function LiveStatus({
  state,
  label,
  children,
}: {
  state: LiveState
  label?: string | undefined
  children?: unknown
}) {
  const dot = derived(() => DOT[state])
  return (
    <span
      data-scope="live-status"
      data-state={state}
      role="status"
      aria-label={label ? `${label}: ${LIVE[state].toLowerCase()}` : undefined}
    >
      {dot.value ? (
        <span data-scope="status-dot" data-tone={dot.value}></span>
      ) : (
        <span data-scope="spinner" aria-hidden="true"></span>
      )}
      {children ?? LIVE[state]}
    </span>
  )
}

/** Page-level message inside main (02 §5). `live` announces it; a Banner that was there on load stays role=note. */
export function Banner({
  tone = 'info',
  live,
  actions,
  children,
  ...rest
}: {
  tone?: Tone | undefined
  live?: 'polite' | 'assertive' | undefined
  actions?: unknown
  children?: unknown
  [attr: string]: unknown
}) {
  // a colour named in warp({ colors }) takes the neutral icon
  const icon = derived(() => toneIcon[tone as keyof typeof toneIcon] ?? toneIcon.neutral)
  const acts = derived(() => actions) // one build, however often it is read
  return (
    <div
      data-scope="banner"
      data-tone={tone === 'info' ? undefined : tone}
      role={live === 'assertive' ? 'alert' : live ? 'status' : 'note'}
      {...rest}
    >
      <span data-part="icon">
        <Icon name={icon.value} />
      </span>
      <div data-part="body">{children}</div>
      {acts.value !== undefined && <div data-part="actions">{acts.value}</div>}
    </div>
  )
}

export type Step = { id: string; title: unknown; description?: unknown; error?: boolean }

/** Steps (05 §4): full labels, the compact count from the CSS. `current` is an index. */
export function Steps({
  label,
  steps,
  current,
}: {
  label: string
  steps: Step[]
  current: number
}) {
  return (
    <div data-scope="steps">
      <ol aria-label={label}>
        {steps.map((s, i) => (
          <li
            key={s.id}
            data-part="item"
            data-state={
              s.error ? 'error' : i < current ? 'complete' : i === current ? 'current' : undefined
            }
            aria-current={i === current ? 'step' : undefined}
          >
            <span data-part="indicator">
              <CheckIcon />
            </span>
            <span data-part="title">{s.title}</span>
            {s.description !== undefined && <span data-part="description">{s.description}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Empty or error state (05 §5): the weave art, a title, one sentence, actions. */
export function EmptyState({
  title,
  tone,
  actions,
  children,
  ...rest
}: {
  title: unknown
  tone?: Tone | undefined
  actions?: unknown
  children?: unknown
  [attr: string]: unknown
}) {
  const acts = derived(() => actions)
  const body = derived(() => children)
  return (
    <div data-scope="empty-state" data-tone={tone} {...rest}>
      <svg data-part="art" viewBox="0 0 96 64" aria-hidden="true">
        <g class="w">
          <path d="M12 4v56M28 4v56M44 4v56M60 4v56M76 4v56" />
        </g>
        <path class="f" d="M4 24H92" />
        <path class="f" d="M4 40H92" style="stroke:var(--warp-color-border-strong)" />
      </svg>
      <h2 data-part="title">{title}</h2>
      {body.value !== undefined && <p data-part="description">{body.value}</p>}
      {acts.value !== undefined && <div data-part="actions">{acts.value}</div>}
    </div>
  )
}
