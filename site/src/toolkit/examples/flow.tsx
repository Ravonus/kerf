import { derived, state } from 'weft'
import {
  AuthDone, AuthScreen, Badge, Button, Card, Checklist, Coachmark, ConnBanner, Flow, Input, InviteAccept, MagicLinkSent, MfaSetup, OtpField, OtpStep, PasskeyButton, PasswordMeter, RateLimited, ReauthDialog, ResetPassword, Row,
  Segmented, Select, ShortcutsOverlay, SignGate, SignGateBadge, SignIn, SignUp, SsoButtons, Stack, SystemPage, Text, Toaster, Tour,
} from '@weft/warp'
import type { SignInValues, SignStatus, SignUpValues } from '@weft/warp'
import { createShortcuts } from '@weft/warp-core'
import { PEOPLE, PROJECTS } from '../world'

const wait = (ms: number) => new Promise(done => setTimeout(done, ms))

const PROVIDERS = [{ id: 'google', label: 'Google', glyph: 'M12 3a9 9 0 1 0 8.5 12H12' }, { id: 'github', label: 'GitHub', glyph: 'M9 8l-5 4 5 4M15 8l5 4-5 4' }]
const SSO = [...PROVIDERS, { id: 'saml', label: 'SAML', name: 'single sign-on' }]

// -- signing in --

export function SignInTessel() {
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
      {who.value
        ? <AuthDone heading="h3" title="You're in" lede={`Signed in as ${who.value}.`} delay={2400} onContinue={() => (who.value = '')} />
        : <SignIn heading="h3" name="Tessel" title="Sign in to Tessel" lede="Any email and password work here." providers={PROVIDERS} pending={pending.value} onSubmit={submit} onProvider={() => wait(900)} onPasskey={() => wait(900)} onForgot={() => {}} onMagicLink={() => {}} onSignUp={() => {}} />}
    </>
  )
}

export const SignInFailed = () => <SignIn heading="h3" title="Sign in to Tessel" error="That email and password don't match." onForgot={() => {}} />

export function AuthScreenSplit() {
  return (
    <AuthScreen name="Tessel" quote="We moved forty services in a quarter and never missed a deploy." cite="Mara Lindqvist · Tessel">
      <SignIn heading="h3" title="Welcome back" lede="Sign in to your workspace." providers={PROVIDERS} onSubmit={() => wait(900)} onForgot={() => {}} onSignUp={() => {}} />
    </AuthScreen>
  )
}

export function SignUpTessel() {
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
      {made.value
        ? <AuthDone heading="h3" title={`Welcome, ${made.value}`} lede="Your workspace is ready." delay={2400} onContinue={() => (made.value = '')} />
        : <SignUp heading="h3" title="Create your workspace" lede="Sample values only: nothing is sent." terms="I agree to the terms" providers={PROVIDERS} pending={pending.value} onSubmit={submit} onSignIn={() => {}} />}
    </>
  )
}

export function PasswordMeterLive() {
  const value = state('')
  return (
    <Stack gap="related">
      <Input label="New password" type="password" autocomplete="off" value={value.value} hint="Try a sample, not a real one." onInput={e => (value.value = e.currentTarget.value)} />
      <PasswordMeter value={value.value} />
    </Stack>
  )
}

export function OtpFieldCheck() {
  const status = state<'idle' | 'checking' | 'success'>('idle')
  const error = state<string | undefined>(undefined)
  const check = async (code: string) => {
    status.value = 'checking'
    await wait(700)
    status.value = code === '123456' ? 'success' : 'idle'
    error.value = code === '123456' ? undefined : "That code didn't work. Try 123456."
  }
  return <OtpField hint="The sample code is 123456." status={status.value} error={error.value} autoSubmit={false} onComplete={check} />
}

export const OtpFieldFour = () => <OtpField label="4-digit PIN" length={4} masked autoSubmit={false} />

export function OtpStepAuthenticator() {
  const pending = state(false)
  const error = state<unknown>(undefined)
  const status = state<'idle' | 'success'>('idle')
  const submit = async ({ code }: { code: string }) => {
    pending.value = true
    await wait(700)
    pending.value = false
    error.value = code === '123456' ? undefined : { code: 'WRONG_CODE', data: { attemptsLeft: 2 } }
    if (code === '123456') status.value = 'success'
  }
  return <OtpStep heading="h3" title="Enter your code" lede="Open your authenticator app. The sample code is 123456." status={status.value} pending={pending.value} error={error.value} onSubmit={submit} onResend={() => {}} onOtherMethod={() => {}} onBack={() => (status.value = 'idle')} />
}

export function MagicLinkSentInbox() {
  const email = PEOPLE[2].email
  const changing = state(false)
  return (
    <>
      {changing.value
        ? <Button emphasis="outline" tone="neutral" onClick={() => (changing.value = false)}>Back to the sent screen</Button>
        : <MagicLinkSent heading="h3" email={email} resendIn={15} onResend={() => {}} onChangeEmail={() => (changing.value = true)} />}
    </>
  )
}

export function ResetPasswordSteps() {
  const stage = state<'request' | 'sent' | 'password' | 'done'>('request')
  return (
    <>
      {stage.value === 'request' && <ResetPassword heading="h3" onSubmit={() => (stage.value = 'sent')} onBack={() => {}} />}
      {stage.value === 'sent' && <MagicLinkSent heading="h3" title="Check your inbox" email="priya@tessel.dev" lede="Press Resend link to stand in for the email." onResend={() => (stage.value = 'password')} resendIn={0} onChangeEmail={() => (stage.value = 'request')} />}
      {stage.value === 'password' && <ResetPassword heading="h3" stage="password" onSubmit={() => (stage.value = 'done')} />}
      {stage.value === 'done' && <AuthDone heading="h3" title="Password changed" lede="Use the new one next time." delay={2400} onContinue={() => (stage.value = 'request')} />}
    </>
  )
}

export function InviteAcceptWorkspace() {
  const answer = state('')
  return (
    <>
      {answer.value
        ? <Stack gap="related" align="center"><Text>{answer.value}</Text><Button size="sm" emphasis="ghost" tone="neutral" onClick={() => (answer.value = '')}>Show it again</Button></Stack>
        : <InviteAccept heading="h3" inviter="Mara Lindqvist" org="Tessel" role="Member" email="dara@tessel.dev" description="Members can deploy and edit projects." onAccept={() => (answer.value = 'Joined Tessel.')} onDecline={() => (answer.value = 'Invite declined.')} onOtherAccount={() => {}} />}
    </>
  )
}

export const AuthDoneSignedIn = () => <AuthDone heading="h3" title="You're in" lede="Signed in as mara@tessel.dev." delay={3600000} />

export function ReauthDialogDelete() {
  const open = state(false)
  const error = state('')
  const confirm = (password: string) => {
    error.value = password === 'sample-password' ? '' : 'That password does not match. Try sample-password.'
    open.value = !!error.value
  }
  return (
    <>
      <Button tone="critical" emphasis="soft" onClick={() => { error.value = ''; open.value = true }}>Delete reports</Button>
      <ReauthDialog open={open} reason="Deleting a project needs your password." error={error.value || undefined} onConfirm={confirm} onPasskey={() => { open.value = false }} />
    </>
  )
}

export function PasskeyButtonSignIn() {
  const done = state(false)
  return (
    <Stack gap="related" align="center">
      <PasskeyButton onPasskey={async () => { await wait(900); done.value = true }} />
      <Text subtle>{done.value ? 'Passkey accepted.' : 'WebAuthn is yours to run. This one is a stub.'}</Text>
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
      <SsoButtons providers={SSO} onProvider={go} />
      <Text subtle>{picked.value ? `Would redirect to ${picked.value}.` : 'Each stays pending until your app redirects.'}</Text>
    </Stack>
  )
}

const SampleQr = () => (
  <svg viewBox="0 0 8 8" width="148" height="148" style="background:#fff" role="img" aria-label="Sample QR code">
    <path d="M0 0h3v3H0zM5 0h3v3H5zM0 5h3v3H0zM4 4h1v1H4zM6 6h1v1H6zM4 1h1v1H4zM1 4h1v1H1z" />
  </svg>
)

const BACKUP_CODES = ['SAMP-LE01', 'SAMP-LE02', 'SAMP-LE03', 'SAMP-LE04']

export function MfaSetupAuthenticator() {
  const open = state(false)
  const on = state(false)
  return (
    <>
      <Stack gap="related" align="center">
        <Badge tone={on.value ? 'positive' : 'neutral'} dot>{on.value ? 'Two-step is on' : 'Two-step is off'}</Badge>
        <Button emphasis="outline" tone="neutral" onClick={() => (open.value = true)}>Set up two-step sign-in</Button>
      </Stack>
      <MfaSetup open={open} qr={<SampleQr />} secret="SAMPLE SECRET" codes={BACKUP_CODES} onVerify={code => code === '123456'} onDownload={() => {}} onDone={() => (on.value = true)} />
      <Toaster />
    </>
  )
}

// -- signature gate --

const SIGN_STATES: { value: SignStatus; label: string }[] = [{ value: 'unsigned', label: 'Unsigned' }, { value: 'pending', label: 'Pending' }, { value: 'signed', label: 'Signed' }, { value: 'expired', label: 'Expired' }, { value: 'error', label: 'Error' }]

export function SignGateLiveKeys() {
  const status = state<SignStatus>('unsigned')
  return (
    <Stack gap="group">
      <Segmented label="What the provider says" size="sm" value={status.value} options={SIGN_STATES} onChange={v => (status.value = v)} />
      <SignGate status={status.value} src="about:blank" title="Sign the data agreement to use live keys" description="Two pages. It takes about a minute." onResend={() => (status.value = 'unsigned')} onRetry={() => (status.value = 'unsigned')}>
        <Card title="Live API keys"><Button>Create live key</Button></Card>
      </SignGate>
    </Stack>
  )
}

const ALL_SIGN_STATES: SignStatus[] = ['unsigned', 'pending', 'signed', 'expired', 'declined', 'error']

export const SignGateBadgeStates = () => (
  <>
    {ALL_SIGN_STATES.map(status => <SignGateBadge key={status} status={status} />)}
  </>
)

// -- onboarding --

const STEPS = [
  { id: 'project', title: 'Create your first project', description: 'Projects hold your services and deploys.' },
  { id: 'repo', title: 'Connect a repository', description: 'Deploy on every push to main.' },
  { id: 'invite', title: 'Invite your team', description: 'Add teammates by email.' },
]

export function ChecklistSetup() {
  const done = state(['project'])
  const finish = (id: string) => (done.value = [...done.value, id])
  const items = derived(() => STEPS.map(step => ({ ...step, done: done.value.includes(step.id), action: { label: 'Do it', onClick: () => finish(step.id) } })))
  return (
    <>
      <Checklist subtitle="Three steps to your first deploy." items={items.value} doneDescription="This card tidies itself away." onHide={() => {}} onUndoHide={() => {}} />
      <Toaster />
    </>
  )
}

export function ChecklistSelfChecked() {
  const done = state<string[]>([])
  const toggle = (id: string, on: boolean) => (done.value = on ? [...done.value, id] : done.value.filter(x => x !== id))
  const items = derived(() => STEPS.map(step => ({ ...step, done: done.value.includes(step.id) })))
  return <Checklist title="Launch day" items={items.value} onToggle={toggle} />
}

const TOUR_STEPS = [
  { target: '[data-tour="new"]', title: 'Start a project', body: 'Connect a repository and your first deploy runs in about a minute.' },
  { target: '[data-tour="deploys"]', title: 'Follow every deploy', body: 'Failed ones land here first, with their logs.' },
  { target: '[data-tour="team"]', title: 'Bring your team', body: 'Invite people and choose what they can do.' },
]

export function TourDashboard() {
  const open = state(false)
  return (
    <Stack gap="group" align="center">
      <Row gap="related">
        <Button data-tour="new" icon="plus">New project</Button>
        <Button data-tour="deploys" emphasis="outline" tone="neutral">Deploys</Button>
        <Button data-tour="team" emphasis="outline" tone="neutral">Team</Button>
      </Row>
      <Button emphasis="link" onClick={() => (open.value = true)}>Take the tour</Button>
      <Tour steps={TOUR_STEPS} open={open} />
    </Stack>
  )
}

export function CoachmarkNewFeature() {
  const seen = state(false)
  return (
    <Stack gap="related" align="center">
      <Button data-coach="rollback" emphasis="outline" tone="neutral">Roll back</Button>
      <Text subtle>{seen.value ? 'Dismissed. Save that in your app.' : 'Press the beacon on the button.'}</Text>
      <Coachmark target='[data-coach="rollback"]' title="One press rollback" body="Puts the last good deploy back in about thirty seconds." onDismiss={() => (seen.value = true)} />
    </Stack>
  )
}

const FRAMEWORKS = [{ value: 'vite', label: 'Vite' }, { value: 'next', label: 'Next.js' }, { value: 'weft', label: 'weft' }]
const WIZARD = ['repo', 'build', 'review']

export function FlowNewProject() {
  const step = state('repo')
  const name = state('storefront')
  const at = () => WIZARD.indexOf(step.value)
  const steps = [
    { id: 'repo', label: 'Repository', render: () => <Input label="Project name" data-autofocus value={name.value} onInput={e => (name.value = e.currentTarget.value)} /> },
    { id: 'build', label: 'Build', render: () => <Select label="Framework" options={FRAMEWORKS} defaultValue="weft" /> },
    { id: 'review', label: 'Review', render: () => <Text>Ready to deploy {name.value} to eu-west.</Text> },
  ]
  return (
    <Stack gap="group">
      <Text role="label">Step {at() + 1} of 3</Text>
      <Flow steps={steps} step={step} />
      <Row gap="related" justify="end">
        <Button emphasis="ghost" tone="neutral" aria-disabled={at() === 0 ? 'true' : undefined} onClick={() => { if (at() > 0) step.value = WIZARD[at() - 1] }}>Back</Button>
        <Button onClick={() => (step.value = WIZARD[(at() + 1) % 3])}>{at() === 2 ? 'Deploy' : 'Continue'}</Button>
      </Row>
    </Stack>
  )
}

// -- system states --

export const SystemPage404 = () => <SystemPage as="h3" kind="404" onSearch={() => {}} searchLabel="Search Tessel" primary={{ label: 'Go to dashboard' }} secondary={{ label: 'Report a broken link' }} meta="/projects/9921 · ref req_8f2a1c" />

const ACCOUNTS = [{ id: 'mara', email: 'mara@tessel.dev', detail: 'Tessel · this workspace', current: true }, { id: 'side', email: 'mara@sample.dev', detail: 'Sample Co · has access', hasAccess: true }]
const PROJECT = { title: PROJECTS[3].name, owner: PROJECTS[3].owner }

export function SystemPage403() {
  const pending = state(false)
  return <SystemPage as="h3" kind="403" autofocus={false} object={PROJECT} account="noor@tessel.dev" accounts={ACCOUNTS} onSwitch={() => {}} request={{ approvers: 'Mara and Jun', pending: pending.value, onSend: () => (pending.value = true), onWithdraw: () => (pending.value = false) }} requestId="req_7Q2K-91XF" />
}

export function SystemPage500() {
  const tries = state(0)
  return <SystemPage as="h3" kind="500" onRetry={() => tries.value++} secondary={{ label: 'Status page' }} requestId={`req_1a9f-${tries.value}`} />
}

export const SystemPageMaintenance = () => <SystemPage as="h3" kind="maintenance" backAt="14:00 UTC" secondary={{ label: 'Status page' }} />

export const SystemPageEmpty = () => <SystemPage as="h3" kind="empty" title="No projects yet" description="Connect a repository and your first deploy runs in about a minute." primary={{ label: 'New project' }} secondary={{ label: 'Import' }} />

export function ConnBannerOffline() {
  const online = state(false)
  const reconnect = async () => {
    await wait(800)
    online.value = true
  }
  return (
    <Stack gap="related">
      <ConnBanner online={online.value} retryIn={4} changes={3} onRetry={reconnect} />
      <Button size="sm" emphasis="outline" tone="neutral" onClick={() => (online.value = !online.value)}>{online.value ? 'Go offline' : 'Come back online'}</Button>
    </Stack>
  )
}

export function ConnBannerNewVersion() {
  const stale = state(true)
  return (
    <Stack gap="related">
      <ConnBanner stale={stale.value} name="Tessel" onReload={() => (stale.value = false)} onLater={() => (stale.value = false)} />
      <Text subtle>{stale.value ? 'A new build went out while this tab was open.' : 'Dismissed.'}</Text>
    </Stack>
  )
}

const EXPORT_BUTTON = { children: 'Export CSV', emphasis: 'outline', tone: 'neutral' } as const

export const RateLimitedExport = () => <RateLimited retryAfter={12} title="Export limit reached." description="You can run 5 exports a minute." trigger={EXPORT_BUTTON} />

const KEYS = createShortcuts()
KEYS.register({ keys: 'g d', label: 'Go to deploys', group: 'Navigate', run() {} })
KEYS.register({ keys: 'g p', label: 'Go to projects', group: 'Navigate', run() {} })
KEYS.register({ keys: 'n', label: 'New project', group: 'Projects', run() {} })
KEYS.register({ keys: 'mod+k', label: 'Open the command palette', group: 'General', run() {} })

export function ShortcutsOverlayApp() {
  const open = state(false)
  return (
    <>
      <Button emphasis="outline" tone="neutral" onClick={() => (open.value = true)}>Keyboard shortcuts</Button>
      <ShortcutsOverlay open={open} shortcuts={KEYS} />
    </>
  )
}
