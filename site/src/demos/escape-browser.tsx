import { state } from '@kerf-js/core'
import {
  lifecycle,
  media,
  on,
  online,
} from '@kerf-js/core/browser'
import { Badge, Card } from '@kerf-js/veneer'

export default function Status() {
  // Each value follows the browser. Its listener leaves
  // with this component.
  const isOnline = online()
  const page = lifecycle()
  const dark = media('(prefers-color-scheme: dark)', {
    ssr: false,
  })
  const presses = state(0)
  // The server has no window. on() would do nothing
  // there, but its argument still has to exist.
  if (typeof window !== 'undefined')
    on(window, 'keydown', () => presses.value++)
  return (
    <Card title="The browser, as values">
      <p>
        Network{' '}
        <Badge
          tone={isOnline.value ? 'positive' : 'critical'}
        >
          {isOnline.value ? 'online' : 'offline'}
        </Badge>
      </p>
      <p>
        This page is <strong>{page.value}</strong>, and
        your system prefers{' '}
        <strong>{dark.value ? 'dark' : 'light'}</strong>.
      </p>
      <p>
        Keys pressed while this page has focus:{' '}
        {presses.value}
      </p>
    </Card>
  )
}
