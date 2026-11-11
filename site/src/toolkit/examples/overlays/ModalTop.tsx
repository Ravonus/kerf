import { state } from '@kerf-js/core'
import { Button, Modal, Text } from '@kerf-js/veneer'

export function ModalTop() {
  const open = state(false)
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (open.value = true)}
      >
        Top
      </Button>
      <Modal
        open={open}
        placement="top"
        title="Search the workspace"
        footer={<Button data-close="">Done</Button>}
      >
        <Text subtle>
          Sits near the top, for search and quick
          commands.
        </Text>
      </Modal>
    </>
  )
}
