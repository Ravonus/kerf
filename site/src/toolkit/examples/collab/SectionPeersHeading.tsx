import { Heading, Row, SectionPeers, Stack } from '@weft-js/warp'

import { IN_CHANNEL, ONE_READER } from './shared-wait'

import { REGIONS as _REGIONS } from '../../world'

export const SectionPeersHeading = () => (
  <Stack gap="related">
    <Row gap="related">
      <Heading level={3}>When to roll back</Heading>
      <SectionPeers peers={IN_CHANNEL} />
    </Row>
    <Row gap="related">
      <Heading level={3}>Who to tell</Heading>
      <SectionPeers peers={ONE_READER} />
    </Row>
  </Stack>
)
