import { state } from '@weft-js/core'
import { Button, Input, Modal, Select, Stack, Text } from '@weft-js/warp'
import { ROLES } from './shared'

export function ModalInvite() {
  const open = state(false)
  const email = state('')
  const role = state('Member')
  const sent = state('')
  const send = () => {
    sent.value = `Invited ${email.value} as ${role.value}.`
    email.value = ''
    open.value = false
  }
  return (
    <Stack gap="related" align="center">
      <Button icon="user" onClick={() => (open.value = true)}>
        Invite a teammate
      </Button>
      <Text subtle>{sent.value}</Text>
      <Modal
        open={open}
        size="sm"
        title="Invite a teammate"
        description="They get an email with a link to join weft."
        footer={
          <>
            <Button emphasis="ghost" tone="neutral" data-close="">
              Cancel
            </Button>
            <Button disabled={!email.value.includes('@')} onClick={send}>
              Send invite
            </Button>
          </>
        }
      >
        <Stack gap="group">
          <Input
            label="Work email"
            type="email"
            placeholder="noor@weft.dev"
            autofocus
            value={email.value}
            onInput={(e: Event) => (email.value = (e.target as HTMLInputElement).value)}
          />
          <Select label="Role" value={role} options={ROLES} />
        </Stack>
      </Modal>
    </Stack>
  )
}
