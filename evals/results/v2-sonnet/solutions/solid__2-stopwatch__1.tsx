import { For, createEffect, createSignal, onCleanup } from 'solid-js'

export function Stopwatch(props: { hidden?: boolean }) {
  const [tenths, setTenths] = createSignal(0)
  const [running, setRunning] = createSignal(false)
  const [speed, setSpeed] = createSignal(1)
  const [laps, setLaps] = createSignal<string[]>([])

  const fmt = (t: number) => (t / 10).toFixed(1)

  createEffect(() => {
    if (!running() || props.hidden) return
    const id = setInterval(() => setTenths(t => t + speed()), 100)
    onCleanup(() => clearInterval(id))
  })

  return (
    <div>
      <span data-testid="elapsed">{fmt(tenths())}</span>
      <button onClick={() => setRunning(r => !r)}>{running() ? 'Stop' : 'Start'}</button>
      <button onClick={() => setLaps(l => [...l, fmt(tenths())])}>Lap</button>
      <button onClick={() => { setRunning(false); setTenths(0); setLaps([]) }}>Reset</button>
      <label>
        Speed
        <select value={String(speed())} onChange={e => setSpeed(Number(e.currentTarget.value))}>
          <option value="1">1×</option>
          <option value="2">2×</option>
          <option value="5">5×</option>
        </select>
      </label>
      <ol aria-label="Laps">
        <For each={laps()}>{(l, i) => <li>{`Lap ${i() + 1}: ${l}`}</li>}</For>
      </ol>
    </div>
  )
}
