import { Boundary, derived, onCleanup, onMount, resource, state, untrack } from 'weft'
import { Alert, Badge, Button, Card, Grid, Heading, Input, LiveStatus, Progress, Row, Shape, Skeleton, Spinner, Stack, Text, Toaster, toast } from '@weft/warp'
import type { LiveState } from '@weft/warp'
import { PROJECTS } from '../world'

type ToastTone = 'neutral' | 'accent' | 'positive' | 'caution' | 'critical' | 'info'

export function ToasterPlay(p: { title: string; description: string; tone: ToastTone; action: boolean }) {
  const show = () => toast.show({ title: p.title, description: p.description, tone: p.tone, action: p.action ? { label: 'Undo', onClick: () => {} } : undefined })
  return (
    <>
      <Button onClick={show}>Show the toast</Button>
      <Toaster />
    </>
  )
}

export const ToasterBasic = () => (
  <>
    <Button onClick={() => toast.show({ title: 'Saved', description: 'Your changes are live.' })}>Save changes</Button>
    <Toaster />
  </>
)

const TONES = ['neutral', 'positive', 'info', 'caution', 'critical'] as const

export const ToasterTones = () => (
  <>
    {TONES.map(tone => <Button key={tone} emphasis="outline" tone={tone} onClick={() => toast.show({ title: 'Deploy finished', tone })}>{tone}</Button>)}
    <Toaster />
  </>
)

export function ToasterUndo() {
  const archived = state(false)
  const archive = () => {
    archived.value = true
    toast.show({ title: 'reports archived', action: { label: 'Undo', onClick: () => (archived.value = false) } })
  }
  return (
    <>
      <Button emphasis="outline" tone="neutral" disabled={archived.value} onClick={archive}>{archived.value ? 'Archived' : 'Archive reports'}</Button>
      <Toaster />
    </>
  )
}

const wait = (ms: number) => new Promise(done => setTimeout(done, ms))

export const ToasterPromise = () => {
  const deploy = () => toast.promise(wait(2200), {
    pending: { title: 'Deploying storefront', description: 'This takes about two seconds.' },
    done: { title: 'storefront is live', description: 'Serving 9f3ac21 in eu-west.' },
    error: 'The deploy failed',
  })
  return (
    <>
      <Button icon="rocket" onClick={deploy}>Deploy</Button>
      <Toaster />
    </>
  )
}

export const ToasterSeveral = () => {
  const many = () => ['eu-west', 'us-east', 'ap-south', 'eu-north'].forEach((region, i) => setTimeout(() => toast.show({ title: `${region} is up to date`, tone: 'positive' }), i * 250))
  return (
    <>
      <Button emphasis="outline" tone="neutral" onClick={many}>Roll out to four regions</Button>
      <Toaster />
    </>
  )
}

export function ToasterDismissed() {
  const id = state('')
  const start = () => (id.value = toast.show({ title: 'Watching for failures', description: 'This stays until you stop it.', duration: 0 }))
  const stop = () => { toast.dismiss(id.value); id.value = '' }
  return (
    <>
      <Button emphasis="outline" tone="neutral" disabled={!!id.value} onClick={start}>Start</Button>
      <Button emphasis="outline" tone="neutral" disabled={!id.value} onClick={stop}>Stop</Button>
      <Toaster />
    </>
  )
}

export function ToasterAfterRedirect() {
  onMount(() => toast.show({ title: 'Welcome back, Mara', description: 'You have two failed deploys to look at.', tone: 'info' }))
  return (
    <>
      <Text subtle>This one fires as the page arrives. Press Replay.</Text>
      <Toaster />
    </>
  )
}

export const AlertPlay = (p: { tone: ToastTone; title: string; children: string; live: boolean }) => (
  <Alert tone={p.tone} title={p.title} live={p.live}>{p.children}</Alert>
)

export const AlertTones = () => (
  <Stack gap="related">
    <Alert tone="info" title="Maintenance on Sunday">Deploys pause for an hour from 02:00 UTC.</Alert>
    <Alert tone="positive" title="All regions healthy">Every check passed in the last hour.</Alert>
    <Alert tone="caution" title="Close to your limit">You've used 82% of this month's build minutes.</Alert>
    <Alert tone="critical" title="Deploy failed">mobile-bff stopped at the health check.</Alert>
  </Stack>
)

export const AlertTitleOnly = () => <Alert tone="positive" title="Domain verified" />

export const AlertBodyOnly = () => <Alert tone="info">Previews are removed 30 days after their branch is deleted.</Alert>

export const AlertWithActions = () => (
  <Alert tone="critical" title="Deploy failed" actions={<><Button size="sm" tone="critical">Retry</Button><Button size="sm" emphasis="ghost" tone="neutral">See logs</Button></>}>
    mobile-bff stopped at the health check after four minutes.
  </Alert>
)

export function AlertDismiss() {
  const shown = state(true)
  return (
    <Stack>
      {shown.value
        ? <Alert tone="info" title="New: preview comments" onDismiss={() => (shown.value = false)}>Your team can now comment on any preview.</Alert>
        : <Row justify="center"><Button emphasis="ghost" tone="neutral" onClick={() => (shown.value = true)}>Show it again</Button></Row>}
    </Stack>
  )
}

export function AlertFormError() {
  const domain = state('')
  const failed = state(false)
  const save = (e: Event) => { e.preventDefault(); failed.value = !domain.value.includes('.') }
  return (
    <Stack as="form" gap="group" onSubmit={save}>
      {failed.value && <Alert live tone="critical" title="That domain won't work">Use a full domain, like shop.tessel.dev.</Alert>}
      <Input label="Domain" placeholder="shop.tessel.dev" value={domain.value} onInput={(e: Event) => (domain.value = (e.target as HTMLInputElement).value)} />
      <Row justify="end"><Button type="submit">Add domain</Button></Row>
    </Stack>
  )
}

export function AlertUsage() {
  const upgraded = state(false)
  return (
    <Stack>
      {upgraded.value
        ? <Alert tone="positive" title="You're on Scale">Your new build minutes are ready.</Alert>
        : <Alert tone="caution" title="82% of build minutes used" actions={<Button size="sm" onClick={() => (upgraded.value = true)}>Upgrade</Button>}>At this pace you'll run out on the 26th, and deploys will queue.</Alert>}
    </Stack>
  )
}

export const ProgressPlay = (p: { label: string; value: number; shape: 'linear' | 'circle'; tone: ToastTone }) => (
  <Stack><Progress label={p.label} value={p.value} shape={p.shape} tone={p.tone} /></Stack>
)

export const ProgressBar = () => (
  <Stack gap="group">
    <Progress label="Build" value={35} />
    <Progress label="Upload" value={80} />
  </Stack>
)

export const ProgressCircle = () => (
  <>
    <Progress label="Uptime target" shape="circle" value={72} />
    <Progress label="Budget" shape="circle" tone="caution" value={91} />
    <Progress label="Syncing" shape="circle" />
  </>
)

export const ProgressTones = () => (
  <Stack gap="group">
    <Progress label="Build minutes" tone="positive" value={38} />
    <Progress label="Storage" tone="caution" value={82} />
    <Progress label="Seats" tone="critical" value={96} />
  </Stack>
)

export const ProgressIndeterminate = () => <Stack><Progress label="Waiting for a build machine" /></Stack>

export function ProgressRun() {
  const pct = state(0)
  const steps = derived(() => (pct.value < 40 ? 'Installing dependencies' : pct.value < 80 ? 'Building' : pct.value < 100 ? 'Uploading' : 'Live'))
  const timer = setInterval(() => (pct.value = Math.min(100, pct.value + 2)), 80)
  onCleanup(() => clearInterval(timer))
  return (
    <Stack>
      <Progress label={steps.value} tone={pct.value === 100 ? 'positive' : undefined} value={pct.value} />
    </Stack>
  )
}

export const ProgressPlanUsage = () => (
  <Card eyebrow="October" title="Your plan">
    <Stack gap="group">
      <Progress label="Build minutes" value={82} tone="caution" />
      <Progress label="Bandwidth" value={46} />
      <Progress label="Seats" value={80} />
    </Stack>
  </Card>
)

export const SpinnerPlay = (p: { size: 'sm' | 'md' | 'lg'; label: string }) => <Spinner size={p.size} label={p.label} />

export const SpinnerSizes = () => (
  <>
    <Spinner size="sm" label="Loading" />
    <Spinner label="Loading" />
    <Spinner size="lg" label="Loading" />
  </>
)

export const SpinnerInline = () => <Row gap="related"><Spinner size="sm" /><Text subtle>Checking the domain</Text></Row>

export function SpinnerRefresh() {
  const busy = state(false)
  const when = state('2 minutes ago')
  const refresh = () => {
    busy.value = true
    setTimeout(() => { busy.value = false; when.value = 'just now' }, 1400)
  }
  return (
    <Row justify="between" gap="group">
      <Stack gap="hair">
        <Text role="heading">storefront logs</Text>
        <Text subtle>Updated {when.value}</Text>
      </Stack>
      {busy.value ? <Spinner label="Refreshing logs" /> : <Button size="sm" emphasis="outline" tone="neutral" icon="refresh" onClick={refresh}>Refresh</Button>}
    </Row>
  )
}

export const SpinnerPanel = () => (
  <Card>
    <Stack gap="related" align="center">
      <Spinner size="lg" label="Waiting for the first build" />
      <Text subtle>Waiting for the first build</Text>
    </Stack>
  </Card>
)

export const SkeletonPlay = (p: { shape: 'text' | 'circle' | 'block'; lines: number; width: string; height: string }) => (
  <Stack gap="tight"><Skeleton shape={p.shape} lines={p.lines} width={p.width || undefined} height={p.height || undefined} /></Stack>
)

export const SkeletonShapes = () => (
  <Stack gap="group">
    <Skeleton />
    <Skeleton shape="circle" width="48px" height="48px" />
    <Skeleton shape="block" height="96px" />
  </Stack>
)

export const SkeletonLines = () => <Stack gap="tight"><Skeleton lines={4} /></Stack>

export const SkeletonProfile = () => (
  <Row gap="related" align="start">
    <Skeleton shape="circle" width="40px" height="40px" />
    <Stack gap="tight">
      <Skeleton width="10rem" />
      <Skeleton width="16rem" />
    </Stack>
  </Row>
)

export function SkeletonThenContent() {
  const ready = state(false)
  const timer = setTimeout(() => (ready.value = true), 1800)
  onCleanup(() => clearTimeout(timer))
  return (
    <Card>
      {ready.value
        ? <Stack gap="tight"><Text role="heading">checkout</Text><Text subtle>Add Apple Pay to the last step, by Tomás. Live in eu-west.</Text></Stack>
        : <Stack gap="tight"><Skeleton width="40%" /><Skeleton lines={2} /></Stack>}
    </Card>
  )
}

export const ShapePlay = (p: { kind: 'text' | 'list' | 'card' | 'media' | 'table'; rows: number; lines: number; label: string }) => <Stack><Shape kind={p.kind} rows={p.rows} cols={4} lines={p.lines} /></Stack>

export const ShapeList = () => <Stack><Shape kind="list" rows={3} /></Stack>

export const ShapeParagraph = () => <Stack><Shape kind="text" lines={4} /></Stack>

export const ShapeTile = () => <Stack><Shape kind="card" media="16/9" lines={2} /></Stack>

export const ShapeTable = () => <Stack><Shape kind="table" rows={4} cols={4} /></Stack>

export const ShapeMedia = () => <Stack><Shape kind="media" media="21/9" /></Stack>

const later = <T,>(value: T) => new Promise<T>(done => setTimeout(done, 1800, value))

function Team() {
  const list = resource(() => later(PROJECTS.slice(0, 4)))
  return (
    <Stack gap="related">
      {(list.value ?? []).map(p => <Row key={p.id} justify="between"><Text>{p.owner}</Text><Text subtle>{p.name}</Text></Row>)}
    </Stack>
  )
}

export const ShapeBoundary = () => (
  <Boundary pending={<Shape kind="text" lines={4} label="Loading owners" />}>
    <Team />
  </Boundary>
)

export const LiveStatusPlay = (p: { state: LiveState; label: string; children: string }) => <LiveStatus state={p.state} label={p.label}>{p.children || undefined}</LiveStatus>

export const LiveStatusStates = () => (
  <>
    <LiveStatus state="connecting" />
    <LiveStatus state="live" />
    <LiveStatus state="reconnecting" />
    <LiveStatus state="offline" />
  </>
)

export const LiveStatusWords = () => (
  <>
    <LiveStatus state="live">Synced</LiveStatus>
    <LiveStatus state="reconnecting">Back in a moment</LiveStatus>
    <LiveStatus state="offline">Saved on this device</LiveStatus>
  </>
)

export function LiveStatusDrop() {
  const now = state<LiveState>('live')
  const drop = () => {
    now.value = 'offline'
    setTimeout(() => (now.value = 'reconnecting'), 1200)
    setTimeout(() => (now.value = 'live'), 2800)
  }
  return (
    <>
      <LiveStatus state={now.value} label="Log stream" />
      <Button size="sm" emphasis="outline" tone="neutral" disabled={now.value !== 'live'} onClick={drop}>Drop the connection</Button>
    </>
  )
}

export const LiveStatusHeader = () => (
  <Row justify="between" gap="group">
    <Stack gap="hair">
      <Heading level={3}>Logs</Heading>
      <Text subtle>storefront, eu-west</Text>
    </Stack>
    <LiveStatus state="live" label="Log stream">Streaming</LiveStatus>
  </Row>
)
