import { state } from '@kerf-js/core'
import {
  Button,
  ConfirmDialog,
  Stack,
  Text,
} from '@kerf-js/veneer'
import { wait } from './shared'

export function ConfirmDialogPause() {
  const open = state(false)
  const paused = state(false)
  const confirm = async () => {
    await wait(700)
    paused.value = !paused.value
  }
  return (
    <>
      <Stack
        gap="related"
        align="center"
      >
        <Text subtle>
          checkout is {paused.value ? 'paused' : 'live'}.
        </Text>
        <Button
          emphasis="outline"
          tone="neutral"
          onClick={() => (open.value = true)}
        >
          {paused.value
            ? 'Resume deploys'
            : 'Pause deploys'}
        </Button>
      </Stack>
      <ConfirmDialog
        open={open}
        title={
          paused.value
            ? 'Resume deploys?'
            : 'Pause deploys?'
        }
        description={[
          'This applies to everyone on ',
          'checkout.',
        ].join('')}
        action={paused.value ? 'Resume' : 'Pause deploys'}
        onConfirm={confirm}
      />
    </>
  )
}
