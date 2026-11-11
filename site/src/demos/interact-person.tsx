import { state } from '@kerf/core'
import { Card, Input } from '@kerf/veneer'

export default function Person() {
  const person = state({
    first: 'Barbara',
    last: 'Hepworth',
    email: 'bhepworth@sculpture.com',
  })
  const setEmail = (email: string) => {
    person.set((d) => {
      d.email = email
    })
  }
  return (
    <Card title="One box, one object">
      <Input
        label="First name"
        value={person.value.first}
        onInput={(e) =>
          (person.value = {
            ...person.value,
            first: e.currentTarget.value,
          })
        }
      />
      <Input
        label="Last name"
        value={person.value.last}
        onInput={(e) =>
          (person.value = {
            ...person.value,
            last: e.currentTarget.value,
          })
        }
      />
      {/* set gives you a copy to change; kerf writes
          the copy back as the new value. */}
      <Input
        label="Email"
        value={person.value.email}
        onInput={(e) => setEmail(e.currentTarget.value)}
      />
      <p>
        {person.value.first} {person.value.last} (
        {person.value.email})
      </p>
    </Card>
  )
}
