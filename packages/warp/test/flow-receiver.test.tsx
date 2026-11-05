import { flush, render } from '@weft-js/core/test'
import { SignIn, type SignInProps } from '../src/flow/SignIn'

afterEach(() => {
  document.body.innerHTML = ''
})

test('magic link reads the current callback and calls it with the props receiver', async () => {
  const calls: Array<{ receiver: unknown; email: string }> = []
  const first = vi.fn()
  const props: SignInProps = { onMagicLink: first }
  const { container } = render(() => SignIn(props))
  props.onMagicLink = function (this: unknown, email) {
    calls.push({ receiver: this, email })
  }
  container.querySelector<HTMLInputElement>('input[name="email"]')!.value = 'a@b.co'
  const link = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('Email me a sign-in link instead'),
  )!
  link.click()
  await flush()
  expect(first).not.toHaveBeenCalled()
  expect(calls).toEqual([{ receiver: props, email: 'a@b.co' }])
})
