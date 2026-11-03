import { state } from '@weft-js/core'
import { Card, Input } from '@weft-js/warp'

export default function Person() {
  const person = state({ first: 'Barbara', last: 'Hepworth', email: 'bhepworth@sculpture.com' })
  return (
    <Card title="One box, one object">
      <Input
        label="First name"
        value={person.value.first}
        onInput={e => (person.value = { ...person.value, first: e.currentTarget.value })}
      />
      <Input
        label="Last name"
        value={person.value.last}
        onInput={e => (person.value = { ...person.value, last: e.currentTarget.value })}
      />
      {/* set hands you a copy of the object to change; weft writes the copy back as the new value. */}
      <Input
        label="Email"
        value={person.value.email}
        onInput={e => {
          const email = e.currentTarget.value
          person.set(d => { d.email = email })
        }}
      />
      <p>{person.value.first} {person.value.last} ({person.value.email})</p>
    </Card>
  )
}
