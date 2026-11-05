import { derived, state, watch } from '@weft-js/core'
import { Button, Card } from '@weft-js/warp'

export default function Stopwatch() {
  const running = state(false)
  const tenths = state(0)
  const picked = state(false)
  const seconds = derived(() =>
    (tenths.value / 10).toFixed(1),
  )
  let lap: HTMLInputElement | undefined

  // Runs when `running` changes. The returned function
  // cleans up before the next run and on removal.
  watch(
    () => running.value,
    (on) => {
      if (!on) return
      const id = setInterval(() => tenths.value++, 100)
      return () => clearInterval(id)
    },
  )

  const selectLap = () => {
    lap?.focus()
    lap?.select()
    picked.value = true
  }

  return (
    <Card title="Stopwatch">
      <p>
        <strong>{seconds.value} s</strong>
      </p>
      <Button
        onClick={() => (running.value = !running.value)}
      >
        {running.value ? 'Stop' : 'Start'}
      </Button>
      <input
        ref={(el: HTMLInputElement) => (lap = el)}
        aria-label="Lap"
        readOnly
        value={`Lap at ${seconds.value} s`}
      />
      <Button
        emphasis="ghost"
        tone="neutral"
        onClick={selectLap}
      >
        Select the lap
      </Button>
      {picked.value && (
        <p>Selected. Copy it with Ctrl+C or Cmd+C.</p>
      )}
    </Card>
  )
}
