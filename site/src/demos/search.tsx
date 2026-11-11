import { derived, state } from '@kerf-js/core'
import { Card, Input, Tag } from '@kerf-js/veneer'

const CITIES = [
  'Lisbon',
  'Oslo',
  'Osaka',
  'Lima',
  'Lagos',
  'Porto',
]

export default function Trips() {
  const query = state('')
  const found = derived(() => {
    const q = query.value.toLowerCase()
    return CITIES.filter((c) =>
      c.toLowerCase().includes(q),
    )
  })
  return (
    <Card title="Where to?">
      <Input
        label="Search cities"
        value={query.value}
        onInput={(e) =>
          (query.value = e.currentTarget.value)
        }
      />
      <p>
        {found.value.length} of {CITIES.length}
      </p>
      <div data-part="tags">
        {found.value.map((c) => (
          <Tag key={c}>{c}</Tag>
        ))}
      </div>
    </Card>
  )
}
