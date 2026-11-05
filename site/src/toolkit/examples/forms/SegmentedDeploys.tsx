import { derived, state } from '@weft-js/core'
import { Row, Segmented, Stack, Text } from '@weft-js/warp'
import { DEPLOYS } from '../../world'
import { DEPLOY_FILTERS } from './shared'

export function SegmentedDeploys() {
  const show = state('all')
  const rows = derived(() =>
    DEPLOYS.filter((d) => show.value === 'all' || d.status === show.value).slice(0, 4),
  )
  return (
    <Stack gap="group">
      <Segmented
        label="Show deploys"
        value={show.value}
        options={DEPLOY_FILTERS}
        onChange={(next) => (show.value = next)}
      />
      <Stack gap="tight">
        {rows.value.map((d) => (
          <Row key={d.id} justify="between" gap="group">
            <Text>{d.project}</Text>
            <Text subtle>{d.commit}</Text>
          </Row>
        ))}
      </Stack>
    </Stack>
  )
}
