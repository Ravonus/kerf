import { state } from '@kerf-js/core'
import { Button, Modal, Text } from '@kerf-js/veneer'

export function ModalBottom() {
  const open = state(false)
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (open.value = true)}
      >
        Bottom
      </Button>
      <Modal
        open={open}
        placement="bottom"
        title="Share this deploy"
        footer={<Button data-close="">Done</Button>}
      >
        <Text subtle>Rises from the bottom edge.</Text>
      </Modal>
    </>
  )
}
