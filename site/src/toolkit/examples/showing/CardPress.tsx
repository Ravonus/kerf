import { state } from '@weft-js/core'
import { Grid, Card, Text } from '@weft-js/warp'
import { PLANS } from './card-data'

export function CardPress() {
  const picked = state('Team')
  return (
    <Grid
      cols={2}
      gap="related"
    >
      {PLANS.map((plan) => (
        <Card
          key={plan}
          eyebrow={
            picked.value === plan ? 'Selected' : 'Plan'
          }
          title={plan}
          aria-pressed={
            picked.value === plan ? 'true' : 'false'
          }
          onClick={() => (picked.value = plan)}
        >
          <Text subtle>
            {plan === 'Team'
              ? '$40 a month'
              : '$120 a month'}
          </Text>
        </Card>
      ))}
    </Grid>
  )
}
