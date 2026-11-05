import { state } from '@weft-js/core'
import { Button, ConfirmDialog } from '@weft-js/warp'
import { wait } from './shared'

export function ConfirmDialogRevoke() {
  const open = state(false)
  return (
    <>
      <Button
        emphasis="soft"
        tone="critical"
        onClick={() => (open.value = true)}
      >
        Remove 2 members
      </Button>
      <ConfirmDialog
        open={open}
        tone="critical"
        title="Remove 2 members?"
        description={[
          'Priya and Tomás lose access right ',
          'away.',
        ].join('')}
        action="Remove 2 members"
        onConfirm={() => wait(600)}
      />
    </>
  )
}
