import { Boundary, resource, state } from '@weft-js/core'
import { Button, Card } from '@weft-js/warp'

const WEATHER = ['Sunny, 21°', 'Rain, 14°', 'Windy, 17°']
// Stands in for a request: answers after 700 ms, or stops when `signal` says the answer isn't wanted any more.
const fetchWeather = (day: number, signal: AbortSignal) =>
  new Promise<string>((done, fail) => {
    const t = setTimeout(() => done(WEATHER[day % WEATHER.length]!), 700)
    signal.addEventListener('abort', () => { clearTimeout(t); fail(new Error('superseded')) })
  })

export default function Forecast() {
  const day = state(0)
  const weather = resource(signal => (day.value === 0 ? Promise.resolve('Press Next day') : fetchWeather(day.value, signal)))
  return (
    <Card title="Forecast">
      <Boundary pending={<p>Loading…</p>}>
        <p>Day {day.value}: {weather.value}</p>
      </Boundary>
      <Button onClick={() => day.value++}>Next day</Button>
    </Card>
  )
}
