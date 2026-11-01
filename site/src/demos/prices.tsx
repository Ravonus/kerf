import { onMount, state } from 'weft'
import { Button, Card } from '@weft/warp'

const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i, price: state(100) }))

export default function Market() {
  const live = state(false)
  onMount(() => {
    const beat = setInterval(() => {
      if (live.value) rows[(Math.random() * 1000) | 0].price.value++
    }, 16)
    return () => clearInterval(beat)
  })
  return (
    <Card title="Market, 1,000 symbols">
      <Button onClick={() => (live.value = !live.value)}>{live.value ? 'Pause' : 'Go live'}</Button>
      <ol data-part="prices">{rows.map(r => <li key={r.id}>{r.price.value}</li>)}</ol>
    </Card>
  )
}
