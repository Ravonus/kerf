import { useEffect, useState } from 'react'

export type StopwatchProps = {
  hidden?: boolean
}

export function Stopwatch({ hidden = false }: StopwatchProps) {
  const [tenths, setTenths] = useState(0)
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [laps, setLaps] = useState<number[]>([])

  const counting = running && !hidden

  useEffect(() => {
    if (!counting) return
    const id = setInterval(() => setTenths(t => t + speed), 100)
    return () => clearInterval(id)
  }, [counting, speed])

  return (
    <div>
      <span data-testid="elapsed">{(tenths / 10).toFixed(1)}</span>
      <button onClick={() => setRunning(r => !r)}>{running ? 'Stop' : 'Start'}</button>
      <button onClick={() => setLaps(ls => [...ls, tenths])}>Lap</button>
      <button onClick={() => { setRunning(false); setTenths(0); setLaps([]) }}>Reset</button>
      <label htmlFor="stopwatch-speed">Speed</label>
      <select
        id="stopwatch-speed"
        value={String(speed)}
        onChange={e => setSpeed(Number(e.target.value))}
      >
        <option value="1">1×</option>
        <option value="2">2×</option>
        <option value="5">5×</option>
      </select>
      <ol aria-label="Laps">
        {laps.map((lap, i) => (
          <li key={i}>{`Lap ${i + 1}: ${(lap / 10).toFixed(1)}`}</li>
        ))}
      </ol>
    </div>
  )
}
