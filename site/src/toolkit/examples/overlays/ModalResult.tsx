import { state } from '@weft-js/core'
import { Button, Icon, Modal } from '@weft-js/warp'

export function ModalResult() {
  const open = state(false)
  return (
    <>
      <Button
        icon="rocket"
        onClick={() => (open.value = true)}
      >
        Deploy
      </Button>
      <Modal
        open={open}
        size="sm"
        mark={
          <Icon
            name="check-circle"
            size={32}
          />
        }
        title="storefront is live"
        description={
          'Deployed 9f3ac21 to' + ' eu-west in 2 minutes.'
        }
        footer={<Button data-close="">Nice</Button>}
      />
    </>
  )
}
