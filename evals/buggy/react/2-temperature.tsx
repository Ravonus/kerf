import { useEffect, useState } from 'react'

const fmt = (x: number) => String(Math.round(x * 10) / 10)
const parse = (t: string) => (t.trim() === '' ? null : Number(t))

export function TemperatureConverter() {
  const [c, setC] = useState('')
  const [f, setF] = useState('')
  const edit = (
    text: string,
    self: (t: string) => void,
    other: (t: string) => void,
    conv: (x: number) => number,
  ) => {
    self(text)
    const n = parse(text)
    if (n === null) other('')
    else if (Number.isFinite(n)) other(fmt(conv(n)))
  }
  useEffect(() => {
    const n = parse(c)
    if (n !== null && Number.isFinite(n)) setF(fmt((n * 9) / 5 + 32))
  }, [c])
  useEffect(() => {
    const n = parse(f)
    if (n !== null && Number.isFinite(n)) setC(fmt(((n - 32) * 5) / 9))
  }, [f])
  return (
    <div>
      <label>
        Celsius <input value={c} onChange={(e) => setC(e.target.value)} />
      </label>
      <label>
        Fahrenheit <input value={f} onChange={(e) => setF(e.target.value)} />
      </label>
    </div>
  )
}
