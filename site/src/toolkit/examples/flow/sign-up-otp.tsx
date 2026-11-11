import { state } from '@kerf-js/core'
import {
  AuthDone,
  Input,
  OtpField,
  OtpStep,
  PasswordMeter,
  SignUp,
  Stack,
} from '@kerf-js/veneer'
import type { SignUpValues } from '@kerf-js/veneer'
import { wait, PROVIDERS } from './sign-in'

const authenticatorLede =
  'Open your authenticator app. The ' +
  'sample code is 123456.'

export function SignUpKerf() {
  const pending = state(false)
  const made = state('')
  const submit = async (values: SignUpValues) => {
    pending.value = true
    await wait(900)
    pending.value = false
    made.value = values.name
  }
  return (
    <>
      {made.value ? (
        <AuthDone
          heading="h3"
          title={`Welcome, ${made.value}`}
          lede="Your workspace is ready."
          delay={2400}
          onContinue={() => (made.value = '')}
        />
      ) : (
        <SignUp
          heading="h3"
          title="Create your workspace"
          lede="Sample values only: nothing is sent."
          terms="I agree to the terms"
          providers={PROVIDERS}
          pending={pending.value}
          onSubmit={(v) => void submit(v)}
          onSignIn={() => {}}
        />
      )}
    </>
  )
}

export function PasswordMeterLive() {
  const value = state('')
  return (
    <Stack gap="related">
      <Input
        label="New password"
        type="password"
        autocomplete="off"
        value={value.value}
        hint="Try a sample, not a real one."
        onInput={(e) =>
          (value.value = e.currentTarget.value)
        }
      />
      <PasswordMeter value={value.value} />
    </Stack>
  )
}

export const SignUpTile = () => (
  <Stack
    gap="related"
    style="inline-size:260px"
  >
    <Input
      label="New password"
      type="password"
      autocomplete="off"
      defaultValue="sample"
    />
    <PasswordMeter value="sample" />
  </Stack>
)

export function OtpFieldCheck() {
  const status = state<'idle' | 'checking' | 'success'>(
    'idle',
  )
  const error = state<string | undefined>(undefined)
  const check = async (code: string) => {
    status.value = 'checking'
    await wait(700)
    status.value = code === '123456' ? 'success' : 'idle'
    error.value =
      code === '123456'
        ? undefined
        : "That code didn't work. Try 123456."
  }
  return (
    <OtpField
      hint="The sample code is 123456."
      status={status.value}
      error={error.value}
      autoSubmit={false}
      onComplete={(c) => void check(c)}
    />
  )
}

export const OtpFieldFour = () => (
  <OtpField
    label="4-digit PIN"
    length={4}
    masked
    autoSubmit={false}
  />
)

export function OtpStepAuthenticator() {
  const pending = state(false)
  const error = state<unknown>(undefined)
  const status = state<'idle' | 'success'>('idle')
  const submit = async ({ code }: { code: string }) => {
    pending.value = true
    await wait(700)
    pending.value = false
    error.value =
      code === '123456'
        ? undefined
        : {
            code: 'WRONG_CODE',
            data: { attemptsLeft: 2 },
          }
    if (code === '123456') status.value = 'success'
  }
  return (
    <OtpStep
      heading="h3"
      title="Enter your code"
      lede={authenticatorLede}
      status={status.value}
      pending={pending.value}
      error={error.value}
      onSubmit={(v) => void submit(v)}
      onResend={() => {}}
      onOtherMethod={() => {}}
      onBack={() => (status.value = 'idle')}
    />
  )
}
