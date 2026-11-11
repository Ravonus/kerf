import { flush, state } from '@kerf-js/core'
import { Alert, Button, Card, Input } from '@kerf-js/veneer'

// Stands in for the server: schema checks, then a check
// only the server can make (an email that is taken).
// It returns errors by field, as `<Form>` gets from a
// schema issue or `invalid()`.
const signUp = (name: string, email: string) =>
  new Promise<Record<string, string>>((done) => {
    setTimeout(() => {
      const errors: Record<string, string> = {}
      if (!name.trim()) errors.name = 'Enter your name.'
      if (!/^\S+@\S+\.\S+$/.test(email))
        errors.email = 'Enter an email address.'
      else if (email === 'taken@example.com')
        errors.email =
          'That email already has an account.'
      done(errors)
    }, 700)
  })

const text = (v: FormDataEntryValue | null) =>
  typeof v === 'string' ? v : ''

export default function SignUp() {
  const errors = state<Record<string, string>>({})
  const pending = state(false)
  const welcome = state('')
  const submit = async (form: HTMLFormElement) => {
    const data = new FormData(form)
    const name = text(data.get('name'))
    pending.value = true
    errors.value = await signUp(
      name,
      text(data.get('email')),
    )
    pending.value = false
    const ok = Object.keys(errors.value).length === 0
    welcome.value = ok ? `Welcome, ${name}.` : ''
    if (ok) form.reset()
    else {
      flush()
      form
        .querySelector<HTMLElement>(
          '[aria-invalid="true"]',
        )
        ?.focus()
    }
  }
  const onSubmit = (
    e: Event & { currentTarget: HTMLFormElement },
  ) => {
    e.preventDefault()
    void submit(e.currentTarget)
  }
  return (
    <Card title="Create an account">
      <form onSubmit={onSubmit}>
        <Input
          label="Name"
          name="name"
          error={errors.get('name')}
        />
        <Input
          label="Email"
          name="email"
          autocomplete="email"
          error={errors.get('email')}
        />
        <Button
          type="submit"
          loading={pending.value}
        >
          Sign up
        </Button>
      </form>
      {welcome.value && (
        <Alert tone="positive">{welcome.value}</Alert>
      )}
    </Card>
  )
}
