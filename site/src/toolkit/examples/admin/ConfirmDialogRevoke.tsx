import { state } from '@kerf-js/core'
import { Button, ConfirmDialog } from '@kerf-js/veneer'
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
