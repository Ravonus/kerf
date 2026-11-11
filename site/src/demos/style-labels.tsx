import { derived, state } from '@kerf/core'
import { Button, Card, Input, Stack } from '@kerf/veneer'

export default function Labels() {
  const email = state('')
  const tried = state(false)
  const problem = derived(() =>
    tried.value && !email.value.includes('@')
      ? 'Enter an email address, like ana@example.com.'
      : undefined,
  )
  const submit = (e: Event) => {
    e.preventDefault()
    tried.value = true
  }
  return (
    <Card title="Newsletter">
      <form
        onSubmit={submit}
        noValidate
      >
        <Stack gap="related">
          {/* label is required: it is the field's
              accessible name. error sets aria-invalid
              and is read with the field. */}
          <Input
            label="Email"
            type="email"
            hint="One email a month."
            error={problem.value}
            value={email.value}
            onInput={(e) =>
              (email.value = e.currentTarget.value)
            }
          />
          <Button type="submit">Sign up</Button>
        </Stack>
      </form>
    </Card>
  )
}
