import { state } from '@weft-js/core'
import { Card, Slider } from '@weft-js/warp'

const person = {
  name: 'Gregorio Y. Zara',
  theme: { background: 'var(--warp-color-accent-soft)', color: 'var(--warp-color-accent-text)' },
}
const today = new Date(2026, 10, 2)

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(date)
}

export default function TodoList() {
  const size = state(16)
  return (
    <Card title={`${person.name}'s todos`}>
      <p>To do on {formatDate(today)}:</p>
      {/* Double braces: an object inside the braces. Reading size.value makes this style live. */}
      <ul style={{ ...person.theme, padding: 'var(--warp-space-group)', borderRadius: 'var(--warp-radius-control)', fontSize: size.value }}>
        <li>Improve the videophone</li>
        <li>Prepare aeronautics lectures</li>
      </ul>
      <Slider label="Text size" min={12} max={28} value={size.value} format={v => `${v}px`} onChange={v => (size.value = v)} />
    </Card>
  )
}
