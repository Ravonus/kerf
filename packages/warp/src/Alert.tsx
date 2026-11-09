import { CloseX } from './CloseX'
import { derived } from '@weft-js/core'
import type { Tone } from './Button'
import { Icon, toneIcon } from './Icon'
import './styles'
import '@weft-js/warp-core/styles/components/button.css' // the close button's markup
import '@weft-js/warp-core/styles/components/alert.css'

/**
 * An inline alert (05 §5): icon, title, description, actions, close. Status is never colour alone: the icon and the
 * words carry it. `live` makes it role="alert" (only for a NEW error the user must hear).
 */
export function Alert({
  tone = 'info',
  title,
  live,
  actions,
  onDismiss,
  children,
}: {
  tone?: Tone | undefined
  title?: unknown
  live?: boolean | undefined
  actions?: unknown
  onDismiss?: () => void
  children?: unknown
}) {
  // a colour named in warp({ colors }) takes the neutral icon
  const icon = derived(() => toneIcon[tone as keyof typeof toneIcon] ?? toneIcon.neutral)
  return (
    <div data-scope="alert" data-tone={tone} role={live ? 'alert' : undefined}>
      <Icon name={icon.value} data-part="icon" />
      {title !== undefined && <div data-part="title">{title}</div>}
      {children !== undefined && <div data-part="description">{children}</div>}
      {actions !== undefined && <div data-part="actions">{actions}</div>}
      {/* <Button emphasis="ghost" tone="neutral" size="sm" icon={XIcon} label="Dismiss"> as its markup: a ghost button needs no JS */}
      {onDismiss && (
        <button
          type="button"
          data-scope="button"
          data-emphasis="ghost"
          data-tone="neutral"
          data-size="sm"
          data-icon-only=""
          aria-label="Dismiss"
          data-part="close"
          data-dismiss=""
          onClick={onDismiss}
        >
          <CloseX />
        </button>
      )}
    </div>
  )
}
