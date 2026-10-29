import { derived } from 'weft'
import type { Tone } from './Button'
import { Icon, toneIcon } from './Icon'
import './styles'
import '@weft/ui-core/styles/components/button.css' // the close button's markup
import '@weft/ui-core/styles/components/alert.css'

/**
 * An inline alert (05 §5): icon, title, description, actions, close. Status is never colour alone: the icon and the
 * words carry it. `live` makes it role="alert" (only for a NEW error the user must hear).
 */
export function Alert({ tone = 'info', title, live, actions, onDismiss, children }: { tone?: Tone; title?: any; live?: boolean; actions?: any; onDismiss?: () => void; children?: any }) {
  const icon = derived(() => toneIcon[tone])
  return (
    <div data-scope="alert" data-tone={tone} role={live ? 'alert' : undefined}>
      <Icon name={icon.value} data-part="icon" />
      {title !== undefined && <div data-part="title">{title}</div>}
      {children !== undefined && <div data-part="description">{children}</div>}
      {actions !== undefined && <div data-part="actions">{actions}</div>}
      {/* <Button emphasis="ghost" tone="neutral" size="sm" icon="x" label="Dismiss"> as its markup: a ghost button needs no JS */}
      {onDismiss && <button type="button" data-scope="button" data-emphasis="ghost" data-tone="neutral" data-size="sm" data-icon-only="" aria-label="Dismiss" data-part="close" data-dismiss="" onClick={onDismiss}><svg data-icon viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg></button>}
    </div>
  )
}
