import { derived, state } from '@weft-js/core'
import { Button, Input, Row, Select, Stack, Text } from '@weft-js/warp'
import { EMAIL, ROLE_OPTIONS } from './shared'

export function FormInvite() {
  const email = state('')
  const role = state<string | null>('Member')
  const tried = state(false)
  const sent = state([{ email: 'noor@weft.dev', role: 'Viewer' }])
  const problem = derived(() =>
    !tried.value || EMAIL.test(email.value)
      ? undefined
      : "That doesn't look like an email address.",
  )
  const invite = (e: Event) => {
    e.preventDefault()
    tried.value = true
    if (!EMAIL.test(email.value)) return
    sent.value = [{ email: email.value, role: role.value! }, ...sent.value]
    email.value = ''
    tried.value = false
  }
  return (
    <Stack gap="group">
      <Stack as="form" gap="group" onSubmit={invite}>
        <Input
          label="Email"
          type="email"
          icon="mail"
          value={email.value}
          error={problem.value}
          onInput={(e) => (email.value = e.currentTarget.value)}
        />
        <Select label="Role" options={ROLE_OPTIONS} value={role} />
        <Button type="submit" full>
          Send invite
        </Button>
      </Stack>
      <Stack gap="tight">
        <Text role="label">Pending</Text>
        {sent.value.map((s) => (
          <Row key={s.email} justify="between">
            <Text>{s.email}</Text>
            <Text subtle>{s.role}</Text>
          </Row>
        ))}
      </Stack>
    </Stack>
  )
}
