import { state } from '@weft-js/core'
import {
  Badge,
  Button,
  MfaSetup,
  PasskeyButton,
  ReauthDialog,
  SsoButtons,
  Stack,
  Text,
  Toaster,
} from '@weft-js/warp'
import { wait, SSO } from './sign-in'

const passwordError =
  'That password does not match. Try ' +
  'sample-password.'

const passkeyDescription =
  'WebAuthn is yours to run. This one is a stub.'

const providerDescription =
  'Each stays pending until your app redirects.'

const sampleQrPath =
  'M0 0h3v3H0zM5 0h3v3H5zM0 5h3v3H0zM4 ' +
  '4h1v1H4zM6 6h1v1H6zM4 1h1v1H4zM1 ' +
  '4h1v1H1z'

export function ReauthDialogDelete() {
  const open = state(false)
  const error = state('')
  const confirm = (password: string) => {
    error.value =
      password === 'sample-password' ? '' : passwordError
    open.value = !!error.value
  }
  const requestDelete = () => {
    error.value = ''
    open.value = true
  }
  return (
    <>
      <Button
        tone="critical"
        emphasis="soft"
        onClick={requestDelete}
      >
        Delete reports
      </Button>
      <ReauthDialog
        open={open}
        reason="Deleting a project needs your password."
        error={error.value || undefined}
        onConfirm={confirm}
        onPasskey={() => {
          open.value = false
        }}
      />
    </>
  )
}

export function PasskeyButtonSignIn() {
  const done = state(false)
  const signIn = async () => {
    await wait(900)
    done.value = true
  }
  return (
    <Stack
      gap="related"
      align="center"
    >
      <PasskeyButton onPasskey={signIn} />
      <Text subtle>
        {done.value
          ? 'Passkey accepted.'
          : passkeyDescription}
      </Text>
    </Stack>
  )
}

export function SsoButtonsProviders() {
  const picked = state('')
  const go = async (id: string) => {
    await wait(900)
    picked.value = id
  }
  return (
    <Stack gap="related">
      <SsoButtons
        providers={SSO}
        onProvider={go}
      />
      <Text subtle>
        {picked.value
          ? `Would redirect to ${picked.value}.`
          : providerDescription}
      </Text>
    </Stack>
  )
}

const SampleQr = () => (
  <svg
    viewBox="0 0 8 8"
    width="148"
    height="148"
    style="background:#fff"
    role="img"
    aria-label="Sample QR code"
  >
    <path d={sampleQrPath} />
  </svg>
)

const BACKUP_CODES = [
  'SAMP-LE01',
  'SAMP-LE02',
  'SAMP-LE03',
  'SAMP-LE04',
]

export function MfaSetupAuthenticator() {
  const open = state(false)
  const on = state(false)
  return (
    <>
      <Stack
        gap="related"
        align="center"
      >
        <Badge
          tone={on.value ? 'positive' : 'neutral'}
          dot
        >
          {on.value
            ? 'Two-step is on'
            : 'Two-step is off'}
        </Badge>
        <Button
          emphasis="outline"
          tone="neutral"
          onClick={() => (open.value = true)}
        >
          Set up two-step sign-in
        </Button>
      </Stack>
      <MfaSetup
        open={open}
        qr={<SampleQr />}
        secret="SAMPLE SECRET"
        codes={BACKUP_CODES}
        onVerify={(code) => code === '123456'}
        onDownload={() => {}}
        onDone={() => (on.value = true)}
      />
      <Toaster />
    </>
  )
}
