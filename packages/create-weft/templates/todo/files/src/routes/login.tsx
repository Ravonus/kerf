import { Form, Link, redirect, type FormApi, type LoadArgs, type Meta } from '@weft/start'
import { Alert, Button, Input, Stack, Text } from '@weft/warp'
import { AuthPage } from '#/components/AuthPage'
import { signIn } from '#/server/session'

export const load = ({ ctx }: LoadArgs) => {
  if (ctx.user) redirect('/todos')
}

export const meta: Meta = { title: 'Sign in', description: 'Daybook is a plain, private list of what you mean to get done.' }

export default function Login() {
  return (
    <AuthPage title="Welcome back" lede="Sign in to pick up where you left off.">
      <Form of={signIn}>
        {(form: FormApi) => (
          <Stack gap="related">
            {form.message.value && <Alert tone="critical" title="We couldn't sign you in" live>{form.message.value}</Alert>}
            <Input label="Email" type="email" autocomplete="username" required {...form.field('email')} />
            <form.Error name="email" class="form-error" />
            <Input label="Password" type="password" name="password" autocomplete="current-password" required />
            <form.Error name="password" class="form-error" />
            <Button type="submit" full loading={form.pending.value}>Sign in</Button>
          </Stack>
        )}
      </Form>
      <Text subtle>New to Daybook? <Link href="/signup">Create an account</Link></Text>
    </AuthPage>
  )
}
