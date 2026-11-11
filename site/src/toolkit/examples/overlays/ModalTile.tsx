import { state } from '@kerf-js/core'
import { Button, Input, Modal } from '@kerf-js/veneer'

export function ModalTile() {
  const open = state(true)
  return (
    <Modal
      inline
      open={open}
      size="sm"
      title="Rename project"
      description={
        'Everyone on the project sees the new name.'
      }
      footer={
        <>
          <Button
            emphasis="ghost"
            tone="neutral"
            data-close=""
          >
            Cancel
          </Button>
          <Button data-close="">Save</Button>
        </>
      }
    >
      <Input
        label="Project name"
        value="storefront"
      />
    </Modal>
  )
}
