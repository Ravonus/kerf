import { useEffect, useRef, useState } from 'react'

export function Stopwatch({ hidden = false }: { hidden?: boolean }) {
  const [tenths, setTenths] = useState(0)
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [laps, setLaps] = useState<number[]>([])
  const speedRef = useRef(speed)
  speedRef.current = speed

  useEffect(() => {
    if (!running || hidden) return
    const id = setInterval(() => setTenths((t) => t + speedRef.current), 100)
    return () => clearInterval(id)
  }, [running, hidden])

  const fmt = (t: number) => (t / 10).toFixed(1)
  return (
    <div>
      <span data-testid="elapsed">{fmt(tenths)}</span>
      <label>
        Speed{' '}
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          <option value="1">1×</option>
          <option value="2">2×</option>
          <option value="5">5×</option>
        </select>
      </label>
      <button onClick={() => setRunning((r) => !r)}>{running ? 'Stop' : 'Start'}</button>
      <button onClick={() => setLaps((l) => [...l, tenths])}>Lap</button>
      <button
        onClick={() => {
          setRunning(false)
          setTenths(0)
          setLaps([])
        }}
      >
        Reset
      </button>
      <ol aria-label="Laps">
        {laps.map((t, i) => (
          <li key={i}>
            Lap {i + 1}: {fmt(t)}
          </li>
        ))}
      </ol>
    </div>
  )
}
