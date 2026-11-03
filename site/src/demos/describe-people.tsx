import { derived, state } from '@weft-js/core'
import { Button, Card } from '@weft-js/warp'

const people = [
  { id: 0, name: 'Creola Katherine Johnson', profession: 'mathematician' },
  { id: 1, name: 'Mario José Molina-Pasquel Henríquez', profession: 'chemist' },
  { id: 2, name: 'Mohammad Abdus Salam', profession: 'physicist' },
  { id: 3, name: 'Percy Lavon Julian', profession: 'chemist' },
  { id: 4, name: 'Subrahmanyan Chandrasekhar', profession: 'astrophysicist' },
]

export default function Scientists() {
  const only = state<string | null>(null)
  // Filter first, then map: the filtered list is a derived value, so it follows `only`.
  const shown = derived(() => (only.value ? people.filter(p => p.profession === only.value) : people))
  return (
    <Card title="Scientists">
      <Button size="sm" emphasis="outline" onClick={() => (only.value = null)}>Everyone</Button>{' '}
      <Button size="sm" emphasis="outline" onClick={() => (only.value = 'chemist')}>Chemists</Button>
      <ul>
        {shown.value.map(p => (
          <li key={p.id}>
            <b>{p.name}</b>: {p.profession}
          </li>
        ))}
      </ul>
      <p>{shown.value.length} of {people.length}</p>
    </Card>
  )
}
