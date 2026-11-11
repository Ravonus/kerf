import { Boundary, resource, state } from '@kerf-js/core'
import { Button, Card } from '@kerf-js/veneer'

// Stands in for a network value arriving after `ms`.
function later<T>(ms: number, value: T): Promise<T> {
  return new Promise((done) => {
    setTimeout(() => done(value), ms)
  })
}

// Stands in for a route's `load`: the name is ready at
// once, while the reviews stream in later as a promise.
function load() {
  return {
    name: 'Pour-over kettle',
    reviews: later(1500, [
      'Pours slowly and evenly.',
      'Heats fast.',
      'Handle stays cool.',
    ]),
  }
}

function Reviews(props: { list: Promise<string[]> }) {
  const { list } = props
  const reviews = resource(() => list)
  return (
    <ul style={reviews.pending ? 'opacity: 0.5' : ''}>
      {(reviews.value ?? []).map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ul>
  )
}

export default function Product() {
  const data = state(load())
  return (
    <Card title={data.value.name}>
      <Boundary pending={<p>Loading reviews…</p>}>
        <Reviews list={data.value.reviews} />
      </Boundary>
      <Button onClick={() => (data.value = load())}>
        Load again
      </Button>
    </Card>
  )
}
