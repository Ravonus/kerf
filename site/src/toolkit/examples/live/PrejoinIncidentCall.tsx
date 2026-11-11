import { state } from '@kerf/core'
import {
  Button,
  Prejoin,
  Row,
  Stack,
  Text,
} from '@kerf/veneer'
import { CALL_DEVICES } from '../../world'
import { pause } from './shared'

export function PrejoinIncidentCall() {
  const joining = state(false)
  const joined = state('')
  const said = state('')
  const join = async (name: string) => {
    joining.value = true
    await pause(1200)
    joining.value = false
    joined.value = name
  }
  return (
    <>
      {joined.value ? (
        <Row gap="related">
          <Text>{joined.value} is in the call.</Text>
          <Button
            emphasis="outline"
            tone="neutral"
            size="sm"
            onClick={() => (joined.value = '')}
          >
            Go back
          </Button>
        </Row>
      ) : (
        <Stack gap="related">
          <Prejoin
            name="Priya Raman"
            devices={CALL_DEVICES}
            level={0.4}
            joining={joining.value}
            onJoin={(n) => void join(n)}
            onTestSound={() =>
              (said.value = 'Test sound played')
            }
          />
          {said.value && (
            <Text
              role="caption"
              subtle
            >
              {said.value}
            </Text>
          )}
        </Stack>
      )}
    </>
  )
}
