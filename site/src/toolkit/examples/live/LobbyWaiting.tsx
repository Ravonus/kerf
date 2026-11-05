import { state } from '@weft-js/core'
import { Button, Lobby, Row, Text } from '@weft-js/warp'

export function LobbyWaiting() {
  const waiting = state(true)
  return (
    <>
      {waiting.value ? (
        <Lobby title="Waiting for Sam Okafor" onCancel={() => (waiting.value = false)}>
          Sam is running the incident review. You'll get in as soon as they let you.
        </Lobby>
      ) : (
        <Row gap="related">
          <Text subtle>Request cancelled.</Text>
          <Button
            emphasis="outline"
            tone="neutral"
            size="sm"
            onClick={() => (waiting.value = true)}
          >
            Ask again
          </Button>
        </Row>
      )}
    </>
  )
}
