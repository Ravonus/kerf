import { state } from '@weft-js/core'
import {
  Badge,
  Card,
  Grid,
  Heading,
  Row,
  Split,
  Stack,
  Text,
  Toggle,
} from '@weft-js/warp'
import { PROJECTS, TONE_OF } from '../../world'

export function SplitMasterDetail() {
  const id = state('checkout')
  const shown = () =>
    PROJECTS.find((p) => p.id === id.value)!
  return (
    <Split
      width="nav"
      gap="group"
    >
      <Stack gap="hair">
        {PROJECTS.slice(0, 6).map((p) => (
          <Toggle
            key={p.id}
            size="sm"
            pressed={id.value === p.id}
            onClick={() => (id.value = p.id)}
          >
            {p.name}
          </Toggle>
        ))}
      </Stack>
      <Card>
        <Stack gap="related">
          <Row
            justify="between"
            gap="tight"
          >
            <Heading level={3}>{shown().name}</Heading>
            <Badge
              tone={TONE_OF[shown().status]}
              dot
            >
              {shown().status}
            </Badge>
          </Row>
          <Text subtle>
            {shown().owner} looks after this one, in{' '}
            {shown().region}.
          </Text>
          <Grid
            min="xs"
            cols={3}
            gap="tight"
          >
            <Stack gap="hair">
              <Text
                role="label"
                subtle
              >
                Deploys
              </Text>
              <Text>{shown().deploys}</Text>
            </Stack>
            <Stack gap="hair">
              <Text
                role="label"
                subtle
              >
                Uptime
              </Text>
              <Text>{shown().uptime}%</Text>
            </Stack>
            <Stack gap="hair">
              <Text
                role="label"
                subtle
              >
                Latency
              </Text>
              <Text>{shown().latency} ms</Text>
            </Stack>
          </Grid>
        </Stack>
      </Card>
    </Split>
  )
}
