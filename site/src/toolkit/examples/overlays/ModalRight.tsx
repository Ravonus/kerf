import { state } from '@weft-js/core'
import { Button, Modal, Text } from '@weft-js/warp'

export function ModalRight() {
  const open = state(false)
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (open.value = true)}
      >
        Right
      </Button>
      <Modal
        open={open}
        placement="right"
        title="Deploy details"
        footer={<Button data-close="">Done</Button>}
      >
        <Text subtle>
          Fills the right side, for details.
        </Text>
      </Modal>
    </>
  )
}
