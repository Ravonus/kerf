import { onCleanup, onMount, state } from '@weft-js/core'
import { interval } from '@weft-js/core/browser'
import { Card, Switch } from '@weft-js/warp'

function Ticker(props: { onLog: (line: string) => void }) {
  const seconds = state(0)
  // Owned by the branch that rendered this component: it stops when the branch goes.
  interval('1s', () => seconds.value++)
  onMount(() => props.onLog('Ticker mounted, interval started'))
  onCleanup(() => props.onLog(`Ticker removed after ${seconds.value} s, interval cleared`))
  return <p>Ticking: {seconds.value} s</p>
}

export default function Owner() {
  const shown = state(true)
  const log = state<string[]>([])
  const add = (line: string) => (log.value = [...log.value.slice(-3), line])
  return (
    <Card title="What a branch owns">
      <Switch checked={shown.value} onChange={(e: Event & { currentTarget: HTMLInputElement }) => (shown.value = e.currentTarget.checked)}>
        Show the ticker
      </Switch>
      {shown.value && <Ticker onLog={add} />}
      <ol>{log.value.map((line, i) => <li key={i}>{line}</li>)}</ol>
    </Card>
  )
}
