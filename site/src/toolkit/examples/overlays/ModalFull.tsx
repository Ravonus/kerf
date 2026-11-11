import { state } from '@kerf/core'
import { Button, Modal, Text } from '@kerf/veneer'

export function ModalFull() {
  const open = state(false)
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (open.value = true)}
      >
        Full
      </Button>
      <Modal
        open={open}
        placement="full"
        title="Compare two deploys"
        footer={<Button data-close="">Done</Button>}
      >
        <Text subtle>
          Covers the whole window, for wide work.
        </Text>
      </Modal>
    </>
  )
}
