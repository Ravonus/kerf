import { createEffect, createSignal, For, onCleanup } from 'solid-js'

export function Stopwatch(props: { hidden?: boolean }) {
  const [tenths, setTenths] = createSignal(0)
  const [running, setRunning] = createSignal(false)
  const [speed, setSpeed] = createSignal(1)
  const [laps, setLaps] = createSignal<number[]>([])

  createEffect(() => { if (props.hidden) setRunning(false) })
  createEffect(() => {
    if (!running()) return
    const id = setInterval(() => setTenths(t => t + speed()), 100)
    onCleanup(() => clearInterval(id))
  })

  const fmt = (t: number) => (t / 10).toFixed(1)
  return (
    <div>
      <span data-testid="elapsed">{fmt(tenths())}</span>
      <label>Speed <select value={String(speed())} onChange={e => setSpeed(Number(e.currentTarget.value))}>
        <option value="1">1×</option><option value="2">2×</option><option value="5">5×</option>
      </select></label>
      <button onClick={() => setRunning(r => !r)}>{running() ? 'Stop' : 'Start'}</button>
      <button onClick={() => setLaps(l => [...l, tenths()])}>Lap</button>
      <button onClick={() => { setRunning(false); setTenths(0); setLaps([]) }}>Reset</button>
      <ol aria-label="Laps"><For each={laps()}>{(t, i) => <li>Lap {i() + 1}: {fmt(t)}</li>}</For></ol>
    </div>
  )
}
