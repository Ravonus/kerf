import { useState } from 'react'

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
  return (
    <div>
      <label>
        Celsius{' '}
        <input
          value={c}
          onChange={(e) => edit(e.target.value, setC, setF, (x) => (x * 9) / 5 + 32)}
        />
      </label>
      <label>
        Fahrenheit{' '}
        <input
          value={f}
          onChange={(e) => edit(e.target.value, setF, setC, (x) => ((x - 32) * 5) / 9)}
        />
      </label>
    </div>
  )
}
