import { state } from '@kerf/core'

import { Row, Text, ViewportRail } from '@kerf/veneer'

import { VIEWPORT_PEERS } from '../../world'

import { RailHeight } from './shared-wait'

export function ViewportRailJump() {
  const seen = state(
    'Press a box to jump to that person.',
  )
  return (
    <Row gap="group">
      <RailHeight>
        <ViewportRail
          peers={VIEWPORT_PEERS}
          self={{ top: 0.02, height: 0.3 }}
          onJump={(p) =>
            (seen.value = `Jumped to ${p.name}.`)
          }
        />
      </RailHeight>
      <Text subtle>{seen.value}</Text>
    </Row>
  )
}
