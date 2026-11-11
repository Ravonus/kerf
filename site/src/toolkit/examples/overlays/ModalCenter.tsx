import { state } from '@kerf-js/core'
import { Button, Modal, Text } from '@kerf-js/veneer'

export function ModalCenter() {
  const open = state(false)
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (open.value = true)}
      >
        Center
      </Button>
      <Modal
        open={open}
        placement="center"
        title="Rename project"
        footer={<Button data-close="">Done</Button>}
      >
        <Text subtle>
          The default: centred on the page.
        </Text>
      </Modal>
    </>
  )
}
