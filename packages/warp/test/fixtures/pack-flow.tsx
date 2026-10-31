// The flow pack on the a11y gallery (?part=flow, rendered by test/a11y/gallery.tsx) and in the hydration test (the `Case`
// exports). Per-file imports: the ?weft-ssr query doesn't follow a .ts barrel. `?flow=` opens one overlay or state.
import { state } from 'weft'
import { Button } from '../../src/Button'
import { Toaster } from '../../src/Toast'
import { AuthScreen } from '../../src/flow/AuthScreen'
import { AuthDone, InviteAccept, MagicLinkSent, ResetPassword } from '../../src/flow/AuthSteps'
import { Checklist } from '../../src/flow/Checklist'
import { ConnBanner, RateLimited } from '../../src/flow/ConnBanner'
import { Flow } from '../../src/flow/Flow'
import { MfaSetup } from '../../src/flow/MfaSetup'
import { OtpField, OtpStep } from '../../src/flow/Otp'
import { ReauthDialog } from '../../src/flow/ReauthDialog'
import { ShortcutsOverlay } from '../../src/flow/ShortcutsOverlay'
import { SignGate, SignGateBadge } from '../../src/flow/SignGate'
import { SignIn } from '../../src/flow/SignIn'
import { SignUp } from '../../src/flow/SignUp'
import { SystemPage } from '../../src/flow/SystemPage'
import { Coachmark, Tour } from '../../src/flow/Tour'

const G_PATH = 'M12 3a9 9 0 1 0 8.5 12H12'
const providers = [{ id: 'google', label: 'Google', glyph: G_PATH }, { id: 'github', label: 'GitHub', glyph: 'M9 8l-5 4 5 4M15 8l5 4-5 4' }, { id: 'saml', label: 'SAML', name: 'single sign-on' }]
const accounts = [{ id: 'jo', email: 'jo@loom.app', detail: 'Loom · this workspace', current: true }, { id: 'jo-a', email: 'jo@acme.co', detail: 'Acme · has access', hasAccess: true }]
const items = [
  { id: 'project', title: 'Create your first project', description: 'Projects hold your services and deploys.', done: true },
  { id: 'invite', title: 'Invite your team', description: 'Add teammates by email and choose their role.', action: { label: 'Show me', onClick() {} } },
  { id: 'repo', title: 'Connect a repository', description: 'Deploy on every push to your main branch.', action: { label: 'Show me', onClick() {} } },
]
const allDone = items.map(i => ({ ...i, done: true }))
const CODES = ['7KQ2-M9XD', 'P4WN-8ZRT', 'H2CJ-6VLB', 'XN5E-3QYA']
const object = { title: 'Q4 brief', owner: 'Kofi Mensah' }

const QR = () => <svg viewBox="0 0 8 8" width="148" height="148" style="background:#fff" role="img" aria-label="QR code for your authenticator app"><path d="M0 0h3v3H0zM5 0h3v3H5zM0 5h3v3H0zM4 4h1v1H4zM6 6h1v1H6z" /></svg>

export const FlowCase = () => <Flow steps={[{ id: 'a', label: 'One', render: () => <p>First</p> }, { id: 'b', label: 'Two', render: () => <p>Second</p> }]} />
export const SignInCase = () => <AuthScreen name="Acme" quote="We moved forty services in a quarter." cite="Ines Okafor · Fieldwork"><SignIn heading="h2" name="Acme" title="Sign in to Acme" lede="Welcome back." providers={providers} onPasskey={() => {}} onForgot={() => {}} onMagicLink={() => {}} onSignUp={() => {}} onInvite={() => {}} /></AuthScreen>
export const SignUpCase = () => <AuthScreen><SignUp heading="h2" terms="I agree to the terms" onSignIn={() => {}} /></AuthScreen>
export const OtpFieldCase = () => <OtpField hint="Paste works." />
export const OtpStepCase = () => <AuthScreen><OtpStep heading="h2" lede="Code sent to •••• 42" onResend={() => {}} onOtherMethod={() => {}} onBack={() => {}} /></AuthScreen>
export const MagicCase = () => <AuthScreen><MagicLinkSent heading="h2" email="ada@fieldwork.dev" mailHref="mailto:" onResend={() => {}} onChangeEmail={() => {}} /></AuthScreen>
export const ResetCase = () => <AuthScreen><ResetPassword heading="h2" onBack={() => {}} /></AuthScreen>
export const ResetNewCase = () => <AuthScreen><ResetPassword heading="h2" stage="password" /></AuthScreen>
export const InviteCase = () => <AuthScreen><InviteAccept heading="h2" inviter="Noor Baptiste" org="Fieldwork" role="Editor" email="ada@fieldwork.dev" description="Editors can deploy." onAccept={() => {}} onDecline={() => {}} onOtherAccount={() => {}} /></AuthScreen>
export const DoneCase = () => <AuthScreen><AuthDone heading="h2" lede="Signed in as ada@fieldwork.dev." onContinue={() => {}} delay={3600000} /></AuthScreen>
export const GateCase = () => <><SignGateBadge status="unsigned" /><SignGate status="unsigned" src="about:blank" title="Sign the data agreement to continue" description="Two pages."><p>Live keys <Button>Create live key</Button></p></SignGate></>
export const GateExpiredCase = () => <SignGate status="expired" title="Sign the data agreement" onResend={() => {}}><p>Live keys</p></SignGate>
export const ChecklistCase = () => <Checklist subtitle="Three steps." items={items} onHide={() => {}} collapsible />
export const ChecklistDoneCase = () => <Checklist items={allDone} doneDescription="This card will tidy itself away." />
export const TourCase = () => <><button type="button" data-tour="a">Target</button><Tour steps={[{ target: '[data-tour=a]', title: 'Start here', body: 'Press it.' }]} /></>
export const CoachCase = () => <><button type="button" data-tour="c">Target</button><Coachmark target="[data-tour=c]" title="New" body="Here it is." /></>
export const Page404Case = () => <SystemPage kind="404" onSearch={() => {}} searchLabel="Search Fieldwork" primary={{ label: 'Go to dashboard' }} secondary={{ label: 'Report a broken link' }} meta="/projects/9921 · ref req_8f2a1c" />
export const Page403Case = () => <SystemPage kind="403" object={object} account="jo@loom.app" request={{ approvers: 'Kofi and Ana' }} accounts={accounts} onSwitch={() => {}} requestId="req_7Q2K-91XF" />
export const Page500Case = () => <SystemPage kind="500" onRetry={() => {}} secondary={{ label: 'Status page' }} requestId="req_1" />
export const MaintCase = () => <SystemPage kind="maintenance" backAt="14:00 UTC" secondary={{ label: 'Status page', href: '#status' }} />
export const EmptyCase = () => <SystemPage kind="empty" title="No projects yet" description="Projects hold your services." primary={{ label: 'Create project' }} secondary={{ label: 'Import' }} />
export const OfflineCase = () => <ConnBanner online={false} retryIn={4} onRetry={() => {}} />
export const StaleCase = () => <ConnBanner stale name="Fieldwork" onReload={() => {}} />
export const RateCase = () => <RateLimited retryAfter={20} title="Export limit reached." description="You can run 5 exports a minute." trigger={{ children: 'Export CSV' }} />
export const ShortcutsCase = () => <ShortcutsOverlay />
const shut = state(false)
const shown = state(true)
export const MfaCase = () => <MfaSetup open={shut} qr={<QR />} secret="JBSW Y3DP" codes={CODES} onVerify={() => true} />
export const ReauthCase = () => <ReauthDialog open={shut} reason="Deleting a project needs your password." onPasskey={() => {}} />

const param = (k: string) => (typeof location === 'object' ? new URLSearchParams(location.search).get(k) : null)

export const Part = () => {
  const open = param('flow')
  if (open === 'mfa') return <><h1>warp flow</h1><Toaster /><MfaSetup open={shown} qr={<QR />} secret="JBSW Y3DP" codes={CODES} onVerify={() => true} /></>
  if (open === 'reauth') return <><h1>warp flow</h1><Toaster /><ReauthDialog open={shown} reason="Deleting a project needs your password." onPasskey={() => {}} error="That password doesn't match." /></>
  if (open === 'shortcuts') return <><h1>warp flow</h1><Toaster /><ShortcutsOverlay open={shown} /></>
  if (open === 'tour') return <><h1>warp flow</h1><Toaster /><p><button type="button" data-tour="a">Target</button></p><Tour open={shown} steps={[{ target: '[data-tour=a]', title: 'Start here', body: 'Press it.' }, { target: '[data-tour=a]', title: 'Again', body: 'Twice.' }]} /></>
  return (
    <>
      <h1>warp flow</h1>
      <Toaster />
      <FlowCase />
      <SignInCase /><SignUpCase /><OtpStepCase /><MagicCase /><ResetCase /><ResetNewCase /><InviteCase />
      <AuthScreen><AuthDone heading="h2" lede="Signed in." delay={3600000} /></AuthScreen>
      <GateCase /><GateExpiredCase />
      <ChecklistCase /><ChecklistDoneCase />
      <CoachCase />
      <Page404Case /><Page403Case /><Page500Case /><MaintCase /><EmptyCase />
      <OfflineCase /><StaleCase /><RateCase />
      <ShortcutsCase />
    </>
  )
}
