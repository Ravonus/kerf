import {
  Row,
  Sparkline,
  Stack,
  Text,
} from '@weft-js/warp'

import { ms, SERVICES_WEEK } from './shared-dollars'

import { REGIONS as _REGIONS } from '../../world'

/** One per row: the line takes spare width, and the
 * number beside it says what it ends on. */
export const SparklineRows = () => (
  <Stack
    gap="related"
    divided
  >
    {SERVICES_WEEK.map(({ name, now, trend, values }) => (
      <Row
        key={name}
        gap="group"
        wrap={false}
        role="img"
        aria-label={
          `${name}: p95 ${now} ms, ` +
          `${trend} over two weeks`
        }
      >
        <Text
          role="label"
          style="inline-size: 7rem"
        >
          {name}
        </Text>
        <div style="flex: 1; min-inline-size: 0">
          <Sparkline
            values={values}
            format={ms}
            color={
              trend.startsWith('rising')
                ? 'var(--warp-color-caution-solid)'
                : undefined
            }
          />
        </div>
        <Text
          subtle
          style="inline-size: 4.5rem; text-align: end"
        >
          {now} ms
        </Text>
      </Row>
    ))}
  </Stack>
)
