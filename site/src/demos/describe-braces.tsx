import { state } from '@kerf-js/core'
import { Card, Slider } from '@kerf-js/veneer'

const person = {
  name: 'Gregorio Y. Zara',
  theme: {
    background: 'var(--veneer-color-accent-soft)',
    color: 'var(--veneer-color-accent-text)',
  },
}
const today = new Date(2026, 10, 2)

function formatDate(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
  })
  return formatter.format(date)
}

export default function TodoList() {
  const size = state(16)
  return (
    <Card title={`${person.name}'s todos`}>
      <p>To do on {formatDate(today)}:</p>
      {/* Double braces hold an object. Reading
          size.value makes this style live. */}
      <ul
        style={{
          ...person.theme,
          padding: 'var(--veneer-space-group)',
          borderRadius: 'var(--veneer-radius-control)',
          fontSize: size.value,
        }}
      >
        <li>Improve the videophone</li>
        <li>Prepare aeronautics lectures</li>
      </ul>
      <Slider
        label="Text size"
        min={12}
        max={28}
        value={size.value}
        format={(v) => `${v}px`}
        onChange={(v) => (size.value = v)}
      />
    </Card>
  )
}
