import { state } from '@weft-js/core'
import { lifecycle, media, on, online } from '@weft-js/core/browser'
import { Badge, Card } from '@weft-js/warp'

export default function Status() {
  // Each is a value that follows the browser. Their listeners go away with this component.
  const isOnline = online()
  const page = lifecycle()
  const dark = media('(prefers-color-scheme: dark)', { ssr: false })
  const presses = state(0)
  // The server renders this too, and has no window: on() would do nothing there, but its argument has to exist.
  if (typeof window !== 'undefined') on(window, 'keydown', () => presses.value++)
  return (
    <Card title="The browser, as values">
      <p>
        Network{' '}
        <Badge tone={isOnline.value ? 'positive' : 'critical'}>
          {isOnline.value ? 'online' : 'offline'}
        </Badge>
      </p>
      <p>
        This page is <strong>{page.value}</strong>, and your system prefers{' '}
        <strong>{dark.value ? 'dark' : 'light'}</strong>.
      </p>
      <p>Keys pressed while this page has focus: {presses.value}</p>
    </Card>
  )
}
