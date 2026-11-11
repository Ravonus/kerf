import { state } from '@kerf/core'
import {
  Button,
  PushSoftAsk,
  Row,
  Stack,
  Text,
} from '@kerf/veneer'

export function PushSoftAskMentions() {
  const said = state('')
  return (
    <Stack gap="related">
      {said.value ? (
        <Row gap="related">
          <Text subtle>{said.value}</Text>
          <Button
            emphasis="ghost"
            tone="neutral"
            size="sm"
            onClick={() => (said.value = '')}
          >
            Show it again
          </Button>
        </Row>
      ) : (
        <PushSoftAsk
          title="Get a ping when a deploy fails?"
          onAccept={() =>
            (said.value =
              'Your app would ask the browser now.')
          }
          onDismiss={() =>
            (said.value =
              'It will stay away for 30 days.')
          }
        >
          Only failed deploys and approvals, on this
          device. You can change it any time.
        </PushSoftAsk>
      )}
    </Stack>
  )
}
