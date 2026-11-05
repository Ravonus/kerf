import { Boundary, resource, state } from '@weft-js/core'
import { Badge, Button, Card, Row } from '@weft-js/warp'

const CITIES = ['Lisbon', 'Oslo', 'Nairobi', 'Lima']
// A request returns a temperature after 800 ms,
// unless `signal` cancels it first.
const fetchTemp = (city: string, signal: AbortSignal) =>
  new Promise<string>((done, fail) => {
    const t = setTimeout(
      () =>
        done(
          `${city}: ` +
            `${10 + Math.round(Math.random() * 20)}°`,
        ),
      800,
    )
    signal.addEventListener('abort', () => {
      clearTimeout(t)
      fail(new Error('cancelled'))
    })
  })

function Temperature({ city }: { city: string }) {
  // Reads `city` before waiting, so a new city fetches
  // again and cancels the old fetch.
  const temp = resource((signal) =>
    fetchTemp(city, signal),
  )
  return (
    <p
      aria-busy={temp.pending ? 'true' : 'false'}
      style={temp.pending ? 'opacity: 0.5' : ''}
    >
      {temp.value}{' '}
      {temp.pending && temp.value !== undefined && (
        <Badge tone="info">updating</Badge>
      )}
    </p>
  )
}

export default function Weather() {
  const city = state('Lisbon')
  return (
    <Card
      title={
        'The old value stays ' + 'while the new one loads'
      }
    >
      <Row
        gap="tight"
        wrap
      >
        {CITIES.map((c) => (
          <Button
            key={c}
            size="sm"
            emphasis={
              city.value === c ? 'solid' : 'ghost'
            }
            onClick={() => (city.value = c)}
          >
            {c}
          </Button>
        ))}
      </Row>
      {/* Temperature makes the resource inside the
          Boundary, so it shows the first load. */}
      <Boundary
        pending={<p>Loading the first answer…</p>}
      >
        <Temperature city={city.value} />
      </Boundary>
    </Card>
  )
}
