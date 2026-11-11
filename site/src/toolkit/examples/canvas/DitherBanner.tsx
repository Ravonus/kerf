import {
  Stack,
  Dither,
  Row,
  Text,
  Button,
} from '@kerf-js/veneer'
import { SOFT } from './paint-primitives'

export const DitherBanner = () => (
  <Stack gap="group">
    <Dither
      gradient={SOFT}
      ramp="positive"
      ratio="5 / 1"
    />
    <Row
      gap="related"
      justify="between"
    >
      <Stack gap="tight">
        <Text role="heading">storefront is live</Text>
        <Text subtle>
          Deployed by Priya Raman in 2 minutes.
        </Text>
      </Stack>
      <Button
        emphasis="outline"
        tone="neutral"
      >
        View logs
      </Button>
    </Row>
  </Stack>
)
