import { Form, Link, redirect, type FormApi, type LoadArgs, type Meta } from '@weft-js/start'
import { Alert, Button, Input, Stack, Text } from '@weft-js/warp'
import { AuthPage } from '#/components/AuthPage'
import { signUp } from '#/server/session'

export const load = ({ ctx }: LoadArgs) => {
  if (ctx.user) redirect('/admin')
}

export const meta: Meta = { title: 'Create the owner account' }

export default function Signup() {
  return (
    <AuthPage
      title="Open up the backroom"
      lede="The first account owns the store. Sign-up closes after it."
    >
      <Form of={signUp}>
        {(form: FormApi) => (
          <Stack gap="related">
            {form.message.value && (
              <Alert tone="critical" title="We couldn't create your account" live>
                {form.message.value}
              </Alert>
            )}
            <Input label="Name" autocomplete="name" required {...form.field('name')} />
            <form.Error name="name" class="form-error" />
            <Input
              label="Email"
              type="email"
              autocomplete="username"
              required
              {...form.field('email')}
            />
            <form.Error name="email" class="form-error" />
            <Input
              label="Password"
              type="password"
              name="password"
              autocomplete="new-password"
              required
              minlength={8}
              hint="At least 8 characters."
            />
            <form.Error name="password" class="form-error" />
            <Button type="submit" full loading={form.pending.value}>
              Create account
            </Button>
          </Stack>
        )}
      </Form>
      <Text subtle>
        Already have an account? <Link href="/login">Sign in</Link>
      </Text>
    </AuthPage>
  )
}
