import { state } from '@weft-js/core'
import { Button, TypeToConfirm } from '@weft-js/warp'
import { wait } from './shared'

export function TypeToConfirmDelete() {
  const open = state(false)
  const gone = state(false)
  return (
    <>
      {gone.value ? (
        <Button emphasis="ghost" tone="neutral" onClick={() => (gone.value = false)}>
          reports deleted. Put it back
        </Button>
      ) : (
        <Button tone="critical" onClick={() => (open.value = true)}>
          Delete reports
        </Button>
      )}
      <TypeToConfirm
        open={open}
        title="Delete reports?"
        description="This can't be undone."
        confirmText="reports"
        items={['41 deploys and their logs', '3 scheduled jobs']}
        action="Delete project"
        onConfirm={async () => {
          await wait(700)
          gone.value = true
        }}
      />
    </>
  )
}
