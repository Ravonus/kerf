import { uid } from '@kerf-js/veneer-core'
import { derived, untrack, watch } from '@kerf-js/core'
import { Badge } from '../../Badge'
import { Button, type Tone } from '../../Button'
import { Alert } from '../../Alert'
import { toast } from '../../Toast'
import { afterFlush } from '../atoms'
import type { IntegrationState, Integration } from '../Integrations'

const BADGE: Record<IntegrationState, [string, Tone | undefined, boolean]> = {
  connected: ['Connected', 'positive', true],
  error: ['Needs attention', 'critical', true],
  off: ['Not connected', undefined, false],
  pending: ['Connecting…', 'caution', true],
}

export function Card({
  item,
  onConnect,
  onConfigure,
}: {
  item: Integration
  onConnect: () => void
  onConfigure: () => void
}) {
  let configure: HTMLElement | undefined
  const id = uid('ig')
  const badge = derived(() => BADGE[item.state])
  watch(
    () => item.state,
    (now, was) => {
      if (was !== 'pending' || now !== 'connected') return
      toast.show({ title: `${untrack(() => item.name)} connected`, tone: 'positive' })
      afterFlush(() => configure?.focus())
    },
  )
  return (
    <li data-scope="integration" data-state={item.state}>
      <span data-part="logo" aria-hidden="true">
        {item.name[0]}
      </span>
      <span data-part="info">
        <b id={id}>{item.name}</b>
        <Badge tone={badge.value[1]} dot={badge.value[2]}>
          {badge.value[0]}
        </Badge>
        <span class="muted">{item.state === 'off' ? item.summary : item.detail}</span>
      </span>
      {item.failure && (
        <span data-part="actions">
          <Alert tone="critical" live>
            {item.failure}
          </Alert>
        </span>
      )}
      <span data-part="actions">
        {item.state === 'off' && (
          <Button emphasis="frame" size="sm" aria-describedby={id} onClick={onConnect}>
            Connect
          </Button>
        )}
        {item.state === 'error' && (
          <Button size="sm" tone="critical" aria-describedby={id} onClick={onConnect}>
            Reconnect
          </Button>
        )}
        {item.state === 'connected' && (
          <Button
            ref={(n) => (configure = n)}
            emphasis="ghost"
            tone="neutral"
            size="sm"
            aria-describedby={id}
            onClick={onConfigure}
          >
            Configure
          </Button>
        )}
      </span>
    </li>
  )
}
