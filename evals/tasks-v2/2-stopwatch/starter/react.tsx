import { useEffect, useState } from 'react'

export function Stopwatch() {
  const [tenths, setTenths] = useState(0)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setTenths(t => t + 1), 100)
    return () => clearInterval(id)
  }, [running])

  return (
    <div>
      <span data-testid="elapsed">{(tenths / 10).toFixed(1)}</span>
      <button onClick={() => setRunning(r => !r)}>{running ? 'Stop' : 'Start'}</button>
      <button onClick={() => { setRunning(false); setTenths(0) }}>Reset</button>
    </div>
  )
}
