import { state } from '@kerf-js/core'
import { Button, Modal, Text } from '@kerf-js/veneer'

export function ModalDefault() {
  const open = state(false)
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (open.value = true)}
      >
        Open modal
      </Button>
      <Modal
        open={open}
        title="Rename project"
        footer={<Button data-close="">Done</Button>}
      >
        <Text subtle>
          Press Done, the cross or Escape to close.
        </Text>
      </Modal>
    </>
  )
}
