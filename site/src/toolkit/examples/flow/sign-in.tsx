import { state } from '@weft-js/core'
import {
  AuthDone,
  AuthScreen,
  Button,
  Heading,
  Input,
  SignIn,
  Stack,
} from '@weft-js/warp'
import type { SignInValues } from '@weft-js/warp'

const testimonial =
  'We moved forty services in a quarter' +
  ' and never missed a deploy.'

export const wait = (ms: number) =>
  new Promise((done) => {
    setTimeout(done, ms)
  })

export const PROVIDERS = [
  {
    id: 'google',
    label: 'Google',
    glyph: 'M12 3a9 9 0 1 0 8.5 12H12',
  },
  {
    id: 'github',
    label: 'GitHub',
    glyph: 'M9 8l-5 4 5 4M15 8l5 4-5 4',
  },
]

export const SSO = [
  ...PROVIDERS,
  { id: 'saml', label: 'SAML', name: 'single sign-on' },
]

// -- signing in --

export function SignInWeft() {
  const pending = state(false)
  const who = state('')
  const submit = async (values: SignInValues) => {
    pending.value = true
    await wait(900)
    pending.value = false
    who.value = values.email
  }
  return (
    <>
      {who.value ? (
        <AuthDone
          heading="h3"
          title="You're in"
          lede={`Signed in as ${who.value}.`}
          delay={2400}
          onContinue={() => (who.value = '')}
        />
      ) : (
        <SignIn
          heading="h3"
          name="weft"
          title="Sign in to weft"
          lede="Any email and password work here."
          providers={PROVIDERS}
          pending={pending.value}
          onSubmit={(v) => void submit(v)}
          onProvider={() => wait(900)}
          onPasskey={() => wait(900)}
          onForgot={() => {}}
          onMagicLink={() => {}}
          onSignUp={() => {}}
        />
      )}
    </>
  )
}

export const SignInTile = () => (
  <Stack
    gap="related"
    style="inline-size:260px"
  >
    <Heading level={3}>Sign in to weft</Heading>
    <Input
      label="Work email"
      placeholder="you@weft.dev"
    />
    <Button full>Sign in</Button>
  </Stack>
)

export const SignInFailed = () => (
  <SignIn
    heading="h3"
    title="Sign in to weft"
    error="That email and password don't match."
    onForgot={() => {}}
  />
)

export function AuthScreenSplit() {
  return (
    <AuthScreen
      name="weft"
      quote={testimonial}
      cite="Mara Lindqvist · weft"
    >
      <SignIn
        heading="h3"
        title="Welcome back"
        lede="Sign in to your workspace."
        providers={PROVIDERS}
        onSubmit={() => void wait(900)}
        onForgot={() => {}}
        onSignUp={() => {}}
      />
    </AuthScreen>
  )
}
