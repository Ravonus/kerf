import { derived } from 'weft'
import { Button, type Tone } from './Button'
import { Icon, toneIcon } from './Icon'
import './styles'
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
      {onDismiss && <Button emphasis="ghost" tone="neutral" size="sm" icon="x" label="Dismiss" data-part="close" data-dismiss="" onClick={onDismiss} />}
    </div>
  )
}
