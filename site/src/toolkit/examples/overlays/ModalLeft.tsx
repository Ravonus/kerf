import { state } from '@weft-js/core'
import { Button, Modal, Text } from '@weft-js/warp'

export function ModalLeft() {
  const open = state(false)
  return (
    <>
      <Button emphasis="outline" tone="neutral" onClick={() => (open.value = true)}>
        Left
      </Button>
      <Modal
        open={open}
        placement="left"
        title="Project menu"
        footer={<Button data-close="">Done</Button>}
      >
        <Text subtle>Fills the left side, for navigation.</Text>
      </Modal>
    </>
  )
}
