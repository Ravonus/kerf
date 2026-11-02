import { derived, state } from 'weft'
import { ActivityFeed, Bell, Button, Card, ConnectionBanner, ConnectionPill, ControlBar, Countdown, Grid, Inbox, Inset, Lobby, MeetingRoom, NotificationPreferences, Prejoin, PushSoftAsk, Row, ScheduledLobby, Stack, Text, Tile, Toaster, TransportPicker, toast } from '@weft/warp'
import type { Note, Participant } from '@weft/warp'
import { ACTIVITY, CALL, CALL_DEVICES, CALL_SELF, CHANNELS, NOTES, PREF_GROUPS, PREF_LOCKED, PREF_OFFERED, PREFS } from '../world'

const pause = (ms: number) => new Promise(done => setTimeout(done, ms))

/** A note list you can read, act on and dismiss. In an app, these calls go to your server. */
function useInbox() {
  const items = state(NOTES)
  const change = (id: string, patch: Partial<Note>) => (items.value = items.value.map(n => (n.id === id ? { ...n, ...patch } : n)))
  return {
    items,
    onRead: (id: string) => change(id, { read: true }),
    onReadAll: () => (items.value = items.value.map(n => (n.read ? n : { ...n, read: true }))),
    onDismiss: (id: string) => (items.value = items.value.filter(n => n.id !== id)),
    onRestore: (note: Note) => (items.value = [note, ...items.value]),
    onAction: (note: Note, action: string) => change(note.id, { read: true, actions: undefined, detail: action === 'approve' ? '· approved' : note.detail }),
  }
}

export function ActivityFeedProject() {
  const items = state(ACTIVITY)
  const add = () => (items.value = [{ id: `new-${items.value.length}`, actor: 'Jun Tanaka', verb: 'deployed', object: 'edge-cache', time: 'Now', day: 'Today' }, ...items.value])
  return (
    <Stack gap="related">
      <ActivityFeed items={items} live="live" title="Project activity" />
      <Row><Button emphasis="outline" tone="neutral" size="sm" onClick={add}>Add a deploy</Button></Row>
    </Stack>
  )
}

export function BellWithInbox() {
  const inbox = useInbox()
  const unread = derived(() => inbox.items.value.filter(n => !n.read).length)
  return (
    <>
      <Bell count={unread} inbox={open => <Inbox variant="popover" {...inbox} open={open.value} />} />
      <Toaster />
    </>
  )
}

export function BellArrivals() {
  const count = state(3)
  return (
    <Row gap="related">
      <Bell count={count} onOpen={() => (count.value = 0)} />
      <Button emphasis="outline" tone="neutral" size="sm" onClick={() => count.value++}>A deploy failed</Button>
    </Row>
  )
}

export const ConnectionPillStates = () => (
  <>
    <ConnectionPill state="live" />
    <ConnectionPill state="connecting" />
    <ConnectionPill state="reconnecting" />
    <ConnectionPill state="offline" />
  </>
)

export function ConnectionBannerOffline() {
  const status = state<'live' | 'reconnecting' | 'offline'>('live')
  const retry = async () => {
    status.value = 'reconnecting'
    await pause(1500)
    status.value = 'live'
  }
  return (
    <Stack gap="related">
      <ConnectionBanner state={status} onRetry={retry} />
      <Row gap="related" justify="between">
        <ConnectionPill state={status} />
        <Button emphasis="outline" tone="neutral" size="sm" onClick={() => (status.value = status.value === 'offline' ? 'live' : 'offline')}>{status.value === 'offline' ? 'Reconnect' : 'Lose the connection'}</Button>
      </Row>
    </Stack>
  )
}

function useControls() {
  const mic = state(true), camera = state(true), sharing = state(false), hand = state(false)
  const side = state<'people' | 'chat' | null>(null)
  const said = state('Use the bar, or Tab to it and press the arrow keys.')
  const onToggle = (c: string) => {
    if (c === 'mic') mic.value = !mic.value
    if (c === 'camera') camera.value = !camera.value
    if (c === 'share') sharing.value = !sharing.value
    if (c === 'hand') hand.value = !hand.value
    if (c === 'chat' || c === 'people') side.value = side.value === c ? null : c
    said.value = `Pressed ${c}`
  }
  return { mic, camera, sharing, hand, side, said, onToggle, onLeave: () => (said.value = 'Left the call') }
}

export function ControlBarCall() {
  const c = useControls()
  return (
    <Stack gap="related" align="center">
      <ControlBar mic={c.mic.value} camera={c.camera.value} sharing={c.sharing.value} hand={c.hand.value} side={c.side.value} onToggle={c.onToggle} onLeave={c.onLeave} />
      <Text role="caption" subtle>{c.said.value}</Text>
    </Stack>
  )
}

export function ControlBarCompact() {
  const c = useControls()
  return (
    <Stack gap="related" align="center">
      <ControlBar compact mic={c.mic.value} camera={c.camera.value} sharing={c.sharing.value} hand={c.hand.value} onToggle={c.onToggle} onLeave={c.onLeave} />
      <Text role="caption" subtle>{c.said.value}</Text>
    </Stack>
  )
}

export function CountdownFreeze() {
  const to = Date.now() + 2 * 3600_000 + 14 * 60_000
  return (
    <Stack gap="related" align="center">
      <Text role="label">Deploy freeze starts in</Text>
      <Countdown to={to} label="Deploy freeze starts in" />
    </Stack>
  )
}

export function InboxPage() {
  const inbox = useInbox()
  return (
    <div style="block-size:520px">
      <Inbox title="Notifications" live="live" {...inbox} />
      <Toaster />
    </div>
  )
}

export const InboxLoading = () => <Inbox items={undefined} />

const NOTHING: Note[] = []
export const InboxEmpty = () => <Inbox items={NOTHING} />

export function LobbyWaiting() {
  const waiting = state(true)
  return (
    <>
      {waiting.value
        ? <Lobby title="Waiting for Sam Okafor" onCancel={() => (waiting.value = false)}>Sam is running the incident review. You'll get in as soon as they let you.</Lobby>
        : <Row gap="related"><Text subtle>Request cancelled.</Text><Button emphasis="outline" tone="neutral" size="sm" onClick={() => (waiting.value = true)}>Ask again</Button></Row>}
    </>
  )
}

const CHAT = () => <Inset pad="group"><Text subtle>Sam: the rollback finished at 15:41.</Text></Inset>
const SLIDE = () => <Inset pad="section"><Text role="heading">mobile-bff timeline</Text></Inset>
const INVITE = () => <Button emphasis="outline" tone="neutral" size="sm" full>Invite people</Button>

export function MeetingRoomIncident() {
  const left = state(false)
  return (
    <div style="block-size:560px">
      {left.value
        ? <Card title="You left the incident review" sweep={false}><Button onClick={() => (left.value = false)}>Rejoin</Button></Card>
        : <MeetingRoom title="Incident review" timer="12:48" recording participants={CALL} self={CALL_SELF} presenter="Sam" shareTitle="Incident timeline" share={SLIDE} chat={CHAT} invite={INVITE} onLeave={() => (left.value = true)} />}
    </div>
  )
}

export const MeetingRoomPhone = () => (
  <div style="block-size:620px">
    <MeetingRoom compact title="Incident review" timer="12:48" participants={CALL} self={CALL_SELF} chat={CHAT} />
  </div>
)

export const NotificationPreferencesTessel = () => (
  <NotificationPreferences groups={PREF_GROUPS} channels={CHANNELS} value={PREFS} offered={PREF_OFFERED} locked={PREF_LOCKED} defaults={{ value: PREFS }} onChange={() => pause(400)} onDigest={() => pause(400)} />
)

export function PrejoinIncidentCall() {
  const joining = state(false)
  const joined = state('')
  const said = state('')
  const join = async (name: string) => {
    joining.value = true
    await pause(1200)
    joining.value = false
    joined.value = name
  }
  return (
    <>
      {joined.value
        ? <Row gap="related"><Text>{joined.value} is in the call.</Text><Button emphasis="outline" tone="neutral" size="sm" onClick={() => (joined.value = '')}>Go back</Button></Row>
        : (
          <Stack gap="related">
            <Prejoin name="Priya Raman" devices={CALL_DEVICES} level={0.4} joining={joining.value} onJoin={join} onTestSound={() => (said.value = 'Test sound played')} />
            {said.value && <Text role="caption" subtle>{said.value}</Text>}
          </Stack>
        )}
    </>
  )
}

export function PushSoftAskMentions() {
  const said = state('')
  return (
    <Stack gap="related">
      {said.value
        ? <Row gap="related"><Text subtle>{said.value}</Text><Button emphasis="ghost" tone="neutral" size="sm" onClick={() => (said.value = '')}>Show it again</Button></Row>
        : <PushSoftAsk title="Get a ping when a deploy fails?" onAccept={() => (said.value = 'Your app would ask the browser now.')} onDismiss={() => (said.value = 'It will stay away for 30 days.')}>Only failed deploys and approvals, on this device. You can change it any time.</PushSoftAsk>}
    </Stack>
  )
}

export function ScheduledLobbyReview() {
  const to = Date.now() + 8 * 60_000
  return (
    <>
      <ScheduledLobby title="Incident review" to={to} onJoin={() => toast.show({ title: 'Joining' })} onAddToCalendar={() => toast.show({ title: 'Added to your calendar' })}>Join opens when the countdown ends.</ScheduledLobby>
      <Toaster />
    </>
  )
}

export function ScheduledLobbyOpen() {
  const to = Date.now() + 2 * 60_000
  const joined = state(false)
  return (
    <Stack gap="related">
      <ScheduledLobby title="Incident review" to={to} joinable onJoin={() => (joined.value = true)} />
      {joined.value && <Text subtle>Joining the call.</Text>}
    </Stack>
  )
}

const TILES: Participant[] = [
  { id: 'sam', name: 'Sam Okafor', role: 'host', isSpeaking: true },
  { id: 'jun', name: 'Jun Tanaka', isMuted: true },
  { id: 'mara', name: 'Mara Lindqvist', handRaised: true },
  { id: 'lena', name: 'Lena Fischer', network: 'poor' },
  { id: 'tomas', name: 'Tomás Oliveira', isCamOn: false },
  { id: 'ines', name: 'Inés Vidal' },
]

export const TileStates = () => (
  <Grid cols={3} gap="related" style="grid-auto-rows:168px;inline-size:100%">
    {TILES.map(p => <Tile key={p.id} p={p} />)}
  </Grid>
)

export const TileWithCamera = () => (
  <div style="block-size:220px;inline-size:320px;display:grid">
    <Tile p={CALL_SELF} self video={() => <img alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect width='16' height='9' fill='%23345'/%3E%3Ccircle cx='8' cy='4' r='2' fill='%2389a'/%3E%3C/svg%3E" />} />
  </div>
)

export const TransportPickerSandbox = () => <TransportPicker />
