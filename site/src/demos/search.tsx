import { derived, state } from 'weft'
import { Card, Input, Tag } from '@weft/warp'

const CITIES = ['Lisbon', 'Oslo', 'Osaka', 'Lima', 'Lagos', 'Porto']

export default function Trips() {
  const query = state('')
  const found = derived(() => {
    const q = query.value.toLowerCase()
    return CITIES.filter(c => c.toLowerCase().includes(q))
  })
  return (
    <Card title="Where to?">
      <Input
        label="Search cities"
        value={query.value}
        onInput={(e: any) => (query.value = e.currentTarget.value)}
      />
      <p>{found.value.length} of {CITIES.length}</p>
      <div data-part="tags">
        {found.value.map(c => <Tag key={c}>{c}</Tag>)}
      </div>
    </Card>
  )
}
