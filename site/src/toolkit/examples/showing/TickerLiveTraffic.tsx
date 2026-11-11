import { state, onCleanup } from '@kerf-js/core'
import { Grid, Card, Text, Ticker } from '@kerf-js/veneer'

export function TickerLiveTraffic() {
  const rate = state(18420)
  const errors = state(41)
  const timer = setInterval(() => {
    rate.value += Math.round(Math.random() * 120 - 50)
    errors.value = Math.max(
      0,
      errors.value + Math.round(Math.random() * 4 - 2),
    )
  }, 1400)
  onCleanup(() => clearInterval(timer))
  return (
    <Grid
      cols={2}
      gap="related"
    >
      <Card eyebrow="Requests a minute">
        <Text role="title">
          <Ticker
            value={rate.value}
            locale="en-US"
          />
        </Text>
      </Card>
      <Card eyebrow="Errors a minute">
        <Text role="title">
          <Ticker
            value={errors.value}
            locale="en-US"
          />
        </Text>
      </Card>
    </Grid>
  )
}
