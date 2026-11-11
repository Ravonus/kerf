import {
  Button,
  Card,
  Grid,
  Spacer,
  Stack,
  Text,
} from '@kerf-js/veneer'

export const SpacerCardFooter = () => (
  <Grid
    min="sm"
    cols={2}
    gap="related"
  >
    <Card>
      <Stack
        gap="related"
        style="block-size:100%"
      >
        <Text role="heading">Pro</Text>
        <Text subtle>Up to 20 projects.</Text>
        <Spacer />
        <Button
          emphasis="outline"
          tone="neutral"
          full
        >
          Current plan
        </Button>
      </Stack>
    </Card>
    <Card>
      <Stack
        gap="related"
        style="block-size:100%"
      >
        <Text role="heading">Scale</Text>
        <Text subtle>
          Unlimited projects, private regions, audit logs
          and a named contact who answers within the hour.
        </Text>
        <Spacer />
        <Button full>Upgrade</Button>
      </Stack>
    </Card>
  </Grid>
)
