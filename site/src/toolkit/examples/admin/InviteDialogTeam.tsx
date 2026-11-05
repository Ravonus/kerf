import { state } from '@weft-js/core'
import {
  Button,
  InviteDialog,
  Stack,
  Text,
  Toaster,
} from '@weft-js/warp'
import { INVITE_ROLES } from '../../world'
import { wait } from './shared'

export function InviteDialogTeam() {
  const open = state(false)
  const sent = state<string[]>([])
  return (
    <>
      <Stack
        gap="related"
        align="center"
      >
        <Button
          icon="plus"
          onClick={() => (open.value = true)}
        >
          Invite people
        </Button>
        <Text subtle>
          {sent.value.length
            ? `Invited ${sent.value.join(', ')}`
            : '3 seats left on Team.'}
        </Text>
      </Stack>
      <InviteDialog
        open={open}
        roles={INVITE_ROLES}
        defaultRole="member"
        seatsLeft={3}
        onSend={async (emails) => {
          await wait(600)
          sent.value = emails
        }}
      />
      <Toaster />
    </>
  )
}
