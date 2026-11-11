import { state } from '@kerf-js/core'
import { Button, Modal, Text } from '@kerf-js/veneer'

export function ModalPlay(p: {
  size: 'sm' | 'md' | 'lg'
  placement:
    | 'center'
    | 'top'
    | 'bottom'
    | 'left'
    | 'right'
    | 'full'
  alert: boolean
  tone: 'neutral' | 'critical'
  title: string
}) {
  const open = state(false)
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (open.value = true)}
      >
        Open the modal
      </Button>
      <Modal
        open={open}
        size={p.size}
        placement={p.placement}
        alert={p.alert}
        tone={
          p.tone === 'critical' ? 'critical' : undefined
        }
        title={p.title}
        description="Everyone on the project sees this."
        footer={<Button data-close="">Done</Button>}
      >
        <Text subtle>
          Press Done, the cross, or Escape to close.
        </Text>
      </Modal>
    </>
  )
}
