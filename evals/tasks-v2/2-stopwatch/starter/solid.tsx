import { createEffect, createSignal, onCleanup } from 'solid-js'

export function Stopwatch() {
  const [tenths, setTenths] = createSignal(0)
  const [running, setRunning] = createSignal(false)

  createEffect(() => {
    if (!running()) return
    const id = setInterval(() => setTenths(t => t + 1), 100)
    onCleanup(() => clearInterval(id))
  })

  return (
    <div>
      <span data-testid="elapsed">{(tenths() / 10).toFixed(1)}</span>
      <button onClick={() => setRunning(r => !r)}>{running() ? 'Stop' : 'Start'}</button>
      <button onClick={() => { setRunning(false); setTenths(0) }}>Reset</button>
    </div>
  )
}
