import { Form, redirect, type FormApi, type LoadArgs } from '@weft-js/start'
import { signIn } from '#/server/session'

export const load = ({ ctx }: LoadArgs) => {
  if (ctx.user) redirect('/')
}
export default function SignIn() {
  return (
    <main>
      <h1>Sign in</h1>
      <Form of={signIn}>
        {(form: FormApi) => (
          <>
            <label>
              Email
              <input name="email" type="email" required />
            </label>
            <label>
              Password
              <input name="password" type="password" required />
            </label>
            {form.message.value && <p role="alert">{form.message.value}</p>}
            <button type="submit">Sign in</button>
          </>
        )}
      </Form>
      <a href="/signup">Sign up</a>
    </main>
  )
}
