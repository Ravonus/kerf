import { createSignal } from 'solid-js'

const fmt = (x: number) => String(Math.round(x * 10) / 10)

export function TemperatureConverter() {
  const [c, setC] = createSignal('')
  const [f, setF] = createSignal('')
  const edit = (text: string, self: (t: string) => void, other: (t: string) => void, conv: (x: number) => number) => {
    self(text)
    if (text.trim() === '') return other('')
    const n = Number(text)
    if (Number.isFinite(n)) other(fmt(conv(n)))
  }
  return (
    <div>
      <label>Celsius <input value={c()} onInput={e => edit(e.currentTarget.value, setC, setF, x => (x * 9) / 5 + 32)} /></label>
      <label>Fahrenheit <input value={f()} onInput={e => edit(e.currentTarget.value, setF, setC, x => ((x - 32) * 5) / 9)} /></label>
    </div>
  )
}
