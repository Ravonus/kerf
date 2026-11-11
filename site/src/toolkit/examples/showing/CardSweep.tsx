import { Grid, Card, Text } from '@kerf/veneer'

export const CardSweep = () => (
  <Grid
    min="xs"
    gap="related"
  >
    <Card
      href="/components/button"
      eyebrow="sweep"
      title="With the line"
      sweep
    >
      <Text subtle>
        Hover me: a line runs around the edge.
      </Text>
    </Card>
    <Card
      href="/components/button"
      eyebrow="Default"
      title="Without it"
    >
      <Text subtle>
        Hover me: only its shadow deepens.
      </Text>
    </Card>
  </Grid>
)
