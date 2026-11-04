import { Boundary, resource, state } from '@weft-js/core'
import { Button, Card, Row, Spinner, Text } from '@weft-js/warp'

const WEATHER = ['Sunny, 21°', 'Rain, 14°', 'Windy, 17°']
const cancelled = state(0)
// Stands in for a request: answers after 700 ms, or stops when `signal` says the answer isn't wanted any more.
const fetchWeather = (day: number, signal: AbortSignal) =>
  new Promise<{ day: number; text: string }>((done, fail) => {
    let answered = false
    const t = setTimeout(() => {
      answered = true
      done({ day, text: WEATHER[day % WEATHER.length]! })
    }, 700)
    // The next fetch aborts this one's signal even after it answered; only a request still waiting is cancelled.
    signal.addEventListener('abort', () => {
      if (answered) return
      clearTimeout(t)
      cancelled.value++
      fail(new Error('superseded'))
    })
  })

function Today(props: { day: number }) {
  // Reads props.day before it waits: a new day fetches again and aborts the fetch still in flight.
  const weather = resource((signal) => fetchWeather(props.day, signal))
  return (
    <Row gap="tight">
      {/* A refetch keeps the last forecast, dimmed, with a spinner beside it until the new one lands. */}
      <p
        aria-busy={weather.pending ? 'true' : 'false'}
        style={weather.pending ? 'opacity: 0.5' : ''}
      >
        Day {weather.value?.day}: {weather.value?.text}
      </p>
      {weather.pending && weather.value !== undefined && (
        <Spinner label={`Loading day ${props.day}`} />
      )}
    </Row>
  )
}

export default function Forecast() {
  const day = state(0)
  return (
    <Card title="Forecast">
      {day.value === 0 ? (
        <p>Press Next day for a forecast.</p>
      ) : (
        // The first load has nothing to keep, so the Boundary shows its fallback until the answer arrives.
        <Boundary
          pending={
            <Row gap="tight">
              <Spinner label="Loading the forecast" />
              <span>Loading…</span>
            </Row>
          }
        >
          <Today day={day.value} />
        </Boundary>
      )}
      <Row gap="tight">
        <Button onClick={() => day.value++}>Next day</Button>
        <Text role="caption" subtle>
          {cancelled.value === 0
            ? 'No request cancelled yet'
            : `${cancelled.value} earlier ${cancelled.value === 1 ? 'request' : 'requests'} cancelled`}
        </Text>
      </Row>
    </Card>
  )
}
