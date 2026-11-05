import { state } from '@weft-js/core'
import { Button, Modal, Stack, Text } from '@weft-js/warp'

export function ModalConfirm() {
  const open = state(false)
  const kept = state(true)
  return (
    <Stack gap="related" align="center">
      <Text subtle>{kept.value ? 'storefront is still here.' : 'storefront is gone.'}</Text>
      <Button tone="critical" onClick={() => (open.value = true)}>
        Delete project
      </Button>
      <Modal
        open={open}
        alert
        size="sm"
        tone="critical"
        title="Delete storefront?"
        description="Its 412 deploys and all its logs go too. This can't be undone."
        footer={
          <>
            <Button emphasis="ghost" tone="neutral" autofocus data-close="">
              Keep it
            </Button>
            <Button tone="critical" data-close="" onClick={() => (kept.value = false)}>
              Delete project
            </Button>
          </>
        }
      />
    </Stack>
  )
}
