import { onMount, state } from 'weft'

const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i, price: state(100) }))

export default function Prices() {
  const running = state(false)
  onMount(() => {
    const beat = setInterval(() => {
      if (running.value) rows[(Math.random() * 1000) | 0].price.value++
    }, 16)
    return () => clearInterval(beat)
  })
  return (
    <>
      <button onClick={() => (running.value = !running.value)}>{running.value ? 'Stop' : 'Start prices'}</button>
      <ol data-part="prices">{rows.map(r => <li key={r.id}>{r.price.value}</li>)}</ol>
    </>
  )
}
