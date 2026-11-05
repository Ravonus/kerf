import { state } from '@weft-js/core'
import { BranchSwitcher, Prose, Row, Stack, Text } from '@weft-js/warp'
import { VERSIONS } from './shared'

export function BranchSwitcherVersions() {
  const at = state(1)
  return (
    <Stack gap="related">
      <Prose text={VERSIONS[at.value]!} />
      <Row gap="related">
        <Text role="caption" subtle>
          Regenerated twice
        </Text>
        <BranchSwitcher index={at.value} count={VERSIONS.length} onChange={(i) => (at.value = i)} />
      </Row>
    </Stack>
  )
}
