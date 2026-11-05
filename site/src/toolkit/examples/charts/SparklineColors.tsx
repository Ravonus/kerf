import {
  Row,
  Sparkline,
  Stack,
  Text,
} from '@weft-js/warp'

import {
  ERRORS,
  percent,
  DEPLOYS,
} from './shared-dollars'

import { REGIONS as _REGIONS } from '../../world'

export const SparklineColors = () => (
  <Stack
    gap="group"
    role="img"
    aria-label="Errors falling, deploys rising"
  >
    <Row
      gap="related"
      justify="between"
    >
      <Text role="label">Error rate</Text>
      <Text subtle>0.22%</Text>
    </Row>
    <Sparkline
      values={ERRORS}
      color="var(--warp-color-critical-solid)"
      format={percent}
    />
    <Row
      gap="related"
      justify="between"
    >
      <Text role="label">Deploys</Text>
      <Text subtle>167</Text>
    </Row>
    <Sparkline
      values={DEPLOYS}
      color="var(--warp-color-positive-solid)"
    />
  </Stack>
)
