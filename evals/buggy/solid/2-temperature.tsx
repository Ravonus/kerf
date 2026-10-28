import { createEffect, createSignal } from 'solid-js'

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
  createEffect(() => { const t = c(); if (t.trim() && Number.isFinite(Number(t))) setF(fmt((Number(t) * 9) / 5 + 32)) })
  createEffect(() => { const t = f(); if (t.trim() && Number.isFinite(Number(t))) setC(fmt(((Number(t) - 32) * 5) / 9)) })
  return (
    <div>
      <label>Celsius <input value={c()} onInput={e => setC(e.currentTarget.value)} /></label>
      <label>Fahrenheit <input value={f()} onInput={e => setF(e.currentTarget.value)} /></label>
    </div>
  )
}
