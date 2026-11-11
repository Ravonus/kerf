import { onCleanup, onMount, state } from '@kerf/core'
import { interval } from '@kerf/core/browser'
import { Card, Switch } from '@kerf/veneer'

function Ticker(props: {
  onLog: (line: string) => void
}) {
  const { onLog } = props
  const seconds = state(0)
  // The rendering branch owns the interval, so it stops
  // when the branch goes.
  interval('1s', () => seconds.value++)
  onMount(() => onLog('Ticker mounted, interval started'))
  onCleanup(() =>
    onLog(
      `Ticker removed after ${seconds.value} s, ` +
        'interval cleared',
    ),
  )
  return <p>Ticking: {seconds.value} s</p>
}

export default function Owner() {
  const shown = state(true)
  const log = state<string[]>([])
  const add = (line: string) =>
    (log.value = [...log.value.slice(-3), line])
  return (
    <Card title="What a branch owns">
      <Switch
        checked={shown.value}
        onChange={(
          e: Event & { currentTarget: HTMLInputElement },
        ) => (shown.value = e.currentTarget.checked)}
      >
        Show the ticker
      </Switch>
      {shown.value && <Ticker onLog={add} />}
      <ol>
        {log.value.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
    </Card>
  )
}
