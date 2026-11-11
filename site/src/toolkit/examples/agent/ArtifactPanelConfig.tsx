import {
  ArtifactPanel,
  Badge,
  Row,
  Stack,
  Text,
} from '@kerf-js/veneer'
import { CONFIG_VERSIONS } from '../../world'

export const ArtifactPanelConfig = () => (
  <div style="block-size:280px">
    <ArtifactPanel
      title="kerf.yaml"
      versions={CONFIG_VERSIONS}
    >
      <Stack gap="related">
        <Row gap="related">
          <Text role="label">mobile-bff</Text>
          <Badge tone="info">ap-south</Badge>
        </Row>
        <Text subtle>
          Two attempts, three seconds each. A slow
          upstream now fails in six seconds, not fifteen.
        </Text>
      </Stack>
    </ArtifactPanel>
  </div>
)
