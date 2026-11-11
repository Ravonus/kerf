import { Boundary, resource, state } from '@kerf/core'
import {
  Button,
  Card,
  Row,
  Spinner,
  Text,
} from '@kerf/veneer'

const WEATHER = ['Sunny, 21°', 'Rain, 14°', 'Windy, 17°']
const cancelled = state(0)
// A request answers after 700 ms, or stops when
// `signal` says the answer is no longer wanted.
const fetchWeather = (day: number, signal: AbortSignal) =>
  new Promise<{ day: number; text: string }>(
    (done, fail) => {
      let answered = false
      const t = setTimeout(() => {
        answered = true
        done({
          day,
          text: WEATHER[day % WEATHER.length]!,
        })
      }, 700)
      // The next fetch aborts even after this answers;
      // only a request still waiting is cancelled.
      signal.addEventListener('abort', () => {
        if (answered) return
        clearTimeout(t)
        cancelled.value++
        fail(new Error('superseded'))
      })
    },
  )

function Today({ day }: { day: number }) {
  // Reads day before waiting: a new day fetches again
  // and aborts the fetch still in flight.
  const weather = resource((signal) =>
    fetchWeather(day, signal),
  )
  return (
    <Row gap="tight">
      {/* A refetch dims the last forecast and shows a
          spinner until the new one lands. */}
      <p
        aria-busy={weather.pending ? 'true' : 'false'}
        style={weather.pending ? 'opacity: 0.5' : ''}
      >
        Day {weather.value?.day}: {weather.value?.text}
      </p>
      {weather.pending && weather.value !== undefined && (
        <Spinner label={`Loading day ${day}`} />
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
        // The first load has nothing to keep. The
        // Boundary shows a fallback until it arrives.
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
        <Button onClick={() => day.value++}>
          Next day
        </Button>
        <Text
          role="caption"
          subtle
        >
          {cancelled.value === 0
            ? 'No request cancelled yet'
            : `${cancelled.value} earlier ` +
              (cancelled.value === 1
                ? 'request'
                : 'requests') +
              ' cancelled'}
        </Text>
      </Row>
    </Card>
  )
}
