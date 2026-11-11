import { state } from '@kerf-js/core'
import { Stack, Row, Button } from '@kerf-js/veneer'
import type { Look } from './stage-landing'
import { LOOK_NAMES } from './look-names'
import { Landing } from './landing-actions'

export const StageLanding = () => {
  const look = state<Look>('dither')
  return (
    <Stack gap="related">
      <Row
        gap="tight"
        role="group"
        aria-label="Look"
      >
        {LOOK_NAMES.map(([id, label]) => (
          <Button
            key={id}
            size="sm"
            tone="neutral"
            emphasis={
              look.value === id ? 'solid' : 'outline'
            }
            aria-pressed={
              look.value === id ? 'true' : 'false'
            }
            onClick={() => (look.value = id)}
          >
            {label}
          </Button>
        ))}
      </Row>
      {look.value === 'dither' && (
        <Landing look="dither" />
      )}
      {look.value === 'flat' && <Landing look="flat" />}
      {look.value === 'sketch' && (
        <Landing look="sketch" />
      )}
      {look.value === 'neon' && <Landing look="neon" />}
    </Stack>
  )
}
