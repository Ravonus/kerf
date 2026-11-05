import { state } from '@weft-js/core'
import { Button, Modal, Text } from '@weft-js/warp'

export function ModalSizes() {
  const small = state(false)
  const medium = state(false)
  const large = state(false)
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (small.value = true)}
      >
        Small
      </Button>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (medium.value = true)}
      >
        Medium
      </Button>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (large.value = true)}
      >
        Large
      </Button>
      <Modal
        open={small}
        size="sm"
        title="Small"
      >
        <Text subtle>A question or one field.</Text>
      </Modal>
      <Modal
        open={medium}
        title="Medium"
      >
        <Text subtle>
          A short form. This is the default.
        </Text>
      </Modal>
      <Modal
        open={large}
        size="lg"
        title="Large"
      >
        <Text subtle>
          A table, a diff or anything wide.
        </Text>
      </Modal>
    </>
  )
}
