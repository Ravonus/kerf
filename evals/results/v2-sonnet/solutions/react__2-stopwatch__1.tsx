import { useEffect, useRef, useState } from 'react'

export function Stopwatch({ hidden = false }: { hidden?: boolean }) {
  const [tenths, setTenths] = useState(0)
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState('1')
  const [laps, setLaps] = useState<number[]>([])
  const speedRef = useRef(1)
  speedRef.current = Number(speed)

  useEffect(() => {
    if (!running || hidden) return
    const id = setInterval(() => setTenths(t => t + speedRef.current), 100)
    return () => clearInterval(id)
  }, [running, hidden])

  return (
    <div>
      <span data-testid="elapsed">{(tenths / 10).toFixed(1)}</span>
      <button onClick={() => setRunning(r => !r)}>{running ? 'Stop' : 'Start'}</button>
      <button onClick={() => setLaps(l => [...l, tenths])}>Lap</button>
      <button onClick={() => { setRunning(false); setTenths(0); setLaps([]) }}>Reset</button>
      <label>
        Speed
        <select value={speed} onChange={e => setSpeed(e.target.value)}>
          <option value="1">1×</option>
          <option value="2">2×</option>
          <option value="5">5×</option>
        </select>
      </label>
      <ol aria-label="Laps">
        {laps.map((l, i) => (
          <li key={i}>{`Lap ${i + 1}: ${(l / 10).toFixed(1)}`}</li>
        ))}
      </ol>
    </div>
  )
}
