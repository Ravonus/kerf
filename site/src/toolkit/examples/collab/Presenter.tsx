import { state } from '@kerf-js/core'

import {
  AutoTrack,
  Heading,
  Segmented,
  Stack,
  Text,
} from '@kerf-js/veneer'

import { JUN } from '../../world'

import { PARTS } from './shared-wait'

export function AutoTrackPresenter() {
  const section = state('detect')
  return (
    <Stack gap="related">
      <Segmented
        label="Jun presents"
        size="sm"
        value={section.value}
        options={PARTS}
        onChange={(v) => (section.value = v)}
      />
      <AutoTrack
        presenter={JUN}
        section={section.value}
        label="Rollback runbook"
        height={180}
      >
        <Stack gap="section">
          <section data-section="detect">
            <Heading level={4}>Detect</Heading>
            <Text subtle>
              A failed health check pages the person on
              call within a minute. The deploy stops on
              its own and nothing else ships until someone
              looks.
            </Text>
          </section>
          <section data-section="roll">
            <Heading level={4}>Roll back</Heading>
            <Text subtle>
              One press puts the last good deploy back. It
              takes about thirty seconds to reach every
              region, and the edge cache follows.
            </Text>
          </section>
          <section data-section="tell">
            <Heading level={4}>Tell people</Heading>
            <Text subtle>
              Post in #incidents, then tell support what
              customers saw and when it ended. Write the
              timeline while it is fresh.
            </Text>
          </section>
        </Stack>
      </AutoTrack>
    </Stack>
  )
}
