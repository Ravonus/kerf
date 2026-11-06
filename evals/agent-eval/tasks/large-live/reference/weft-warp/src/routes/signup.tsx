import { Form, redirect, type FormApi, type LoadArgs } from '@weft-js/start'
import { signUp } from '#/server/session'

export const load = ({ ctx }: LoadArgs) => {
  if (ctx.user) redirect('/')
}
export default function SignUp() {
  return (
    <main>
      <h1>Sign up</h1>
      <Form of={signUp}>
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
            <button type="submit">Sign up</button>
          </>
        )}
      </Form>
      <a href="/signin">Sign in</a>
    </main>
  )
}
