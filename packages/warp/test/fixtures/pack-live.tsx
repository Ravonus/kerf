// The live pack on the a11y gallery (?part=live): rendered by test/a11y/gallery.tsx. Named cases for hydration.
import { state } from 'weft'
import type { PrefGroup } from '@weft/warp-core'
import { ActivityFeed } from '../../src/live/ActivityFeed'
import { Bell } from '../../src/live/Bell'
import { ConnectionBanner, ConnectionPill } from '../../src/live/Connection'
import { Inbox, type Note } from '../../src/live/Inbox'
import { MeetingRoom, type Participant } from '../../src/live/MeetingRoom'
import { NotificationPreferences } from '../../src/live/NotificationPreferences'
import { Countdown, Lobby, Prejoin, ScheduledLobby } from '../../src/live/Prejoin'
import { PushSoftAsk } from '../../src/live/PushSoftAsk'
import { TransportPicker } from '../../src/live/TransportPicker'
import { LiveStatus } from '../../src/parts'
import { Toaster } from '../../src/Toast'
import { Button } from '../../src/Button'

export const NOTES: Note[] = [
  { id: 'n1', actor: 'Mei Tanaka', kind: 'mention', verb: 'mentioned you in', object: 'Overlap layout', time: '9 min', day: 'Today', source: 'Chat', quote: '@you can the third column span when the right side is free?' },
  { id: 'n2', actor: 'Raj Patel', kind: 'approve', verb: 'asked you to approve', object: 'Release 2026.11', time: '32 min', day: 'Today', actions: [{ id: 'approve', label: 'Approve' }, { id: 'view', label: 'View', emphasis: 'outline' }] },
  { id: 'n3', actor: 'Kofi Mensah', kind: 'invite', verb: 'invited you to', object: '1:1 Kofi', detail: '· Mon 15:00', time: '1 h', day: 'Today', source: 'Calendar', read: true },
  { id: 'n4', actor: 'Ana Ruiz', kind: 'comment', verb: 'commented on', object: 'Q4 brief', time: 'Yesterday', day: 'Yesterday', quote: 'Love the agenda-first phone view.', read: true },
  { id: 'n5', actor: 'Ivy Chen', kind: 'assign', verb: 'assigned you', object: 'DST drift in weekly events', time: 'Yesterday', day: 'Yesterday', read: true },
]
export const ACTIVITY = [
  { id: 'a1', actor: 'Ana Ruiz', verb: 'moved', object: 'Design crit', detail: 'to Thu 14:00', time: '10:31' },
  { id: 'a2', actor: 'Mei Tanaka', verb: 'commented on', object: 'Overlap layout', time: '10:22' },
  { id: 'a3', actor: 'Kofi Mensah', verb: 'accepted', object: '1:1 Kofi', time: '09:58' },
  { id: 'a4', actor: 'Raj Patel', verb: 'created', object: 'Release 2026.11', detail: 'milestone', time: '09:40' },
]
export const CHANNELS = [{ id: 'inapp', label: 'In-app' }, { id: 'email', label: 'Email' }, { id: 'push', label: 'Push' }, { id: 'sms', label: 'SMS' }]
export const GROUPS: PrefGroup[] = [
  { id: 'collab', label: 'Collaboration', events: [{ id: 'mention', label: 'Mentions', hint: 'Someone @-mentions you' }, { id: 'reply', label: 'Replies', hint: "In threads you're part of" }, { id: 'assign', label: 'Assignments', hint: 'A task or review is assigned to you' }] },
  { id: 'cal', label: 'Calendar', events: [{ id: 'invite', label: 'Invitations', hint: 'New events and RSVPs' }, { id: 'remind', label: 'Reminders', hint: 'Before an event starts' }] },
  { id: 'acct', label: 'Account', events: [{ id: 'security', label: 'Security alerts', hint: 'New sign-in, password or key change', instant: true }, { id: 'billing', label: 'Billing', hint: 'Receipts and failed payments' }] },
]
export const PREFS = {
  mention: { inapp: true, email: true, push: true, sms: false }, reply: { inapp: true, email: false, push: true }, assign: { inapp: true, email: true, push: false },
  invite: { inapp: true, email: true, push: true, sms: false }, remind: { inapp: true, push: true, sms: true },
  security: { inapp: true, email: true, push: true, sms: true }, billing: { inapp: false, email: true },
}
export const OFFERED = { reply: ['inapp', 'email', 'push'], assign: ['inapp', 'email', 'push'], remind: ['inapp', 'push', 'sms'], billing: ['inapp', 'email'] }
export const LOCKED = { security: ['email'] }
export const PEOPLE: Participant[] = [
  { id: 'kofi', name: 'Kofi Mensah', role: 'host', isSpeaking: true },
  { id: 'ana', name: 'Ana Ruiz', isMuted: true },
  { id: 'mei', name: 'Mei Tanaka' },
  { id: 'sam', name: 'Sam Okafor', handRaised: true },
  { id: 'lea', name: 'Léa Martin', isMuted: true, network: 'poor' },
  { id: 'raj', name: 'Raj Patel', isCamOn: false },
]
const ME: Participant = { id: 'you', name: 'Jo Diaz' }
const DEVICES = { mics: [{ value: 'mbp', label: 'MacBook Pro Microphone' }], cameras: [{ value: 'fth', label: 'FaceTime HD Camera' }], speakers: [{ value: 'air', label: 'AirPods Pro' }] }
const NOW = 1_800_000_000_000

export const InboxCase = () => <Inbox items={NOTES} live="live" viewAll="/notifications" />
export const InboxEmptyCase = () => <Inbox items={[]} />
export const BellCase = () => <Bell count={3} />
export const BellPanelCase = () => <Bell count={2} inbox={open => <Inbox variant="popover" items={NOTES} open={open.value} />} />
export const ActivityCase = () => <ActivityFeed items={ACTIVITY} live="live" />
export const PushCase = () => <PushSoftAsk onAccept={() => {}} />
export const ConnectionCase = () => <><ConnectionPill state="live" /><ConnectionPill state="offline" /><ConnectionBanner state="offline" onRetry={() => {}} /></>
export const LiveRowCase = () => <><LiveStatus state="connecting" /><LiveStatus state="live" /><LiveStatus state="reconnecting" /><LiveStatus state="offline" /></>
export const PrefsCase = () => <NotificationPreferences groups={GROUPS} channels={CHANNELS} value={PREFS} offered={OFFERED} locked={LOCKED} defaults={{ value: PREFS }} />
export const TransportCase = () => <TransportPicker />
export const RoomCase = () => <div class="room-box"><MeetingRoom title="Design crit" timer="32:14" recording participants={PEOPLE} self={ME} /></div>
export const RoomSpeakerCase = () => <div class="room-box"><MeetingRoom title="Design crit" layout="speaker" compact participants={PEOPLE} self={ME} /></div>
export const PrejoinCase = () => <Prejoin name="Jo Diaz" devices={DEVICES} level={0.5} onTestSound={() => {}} />
export const LobbyCase = () => <Lobby />
export const ScheduledCase = () => <ScheduledLobby title="Q4 review starts soon" to={NOW + 252000} now={NOW} opensAt="10:50" onAddToCalendar={() => {}}>Join opens 10 minutes before the start.</ScheduledLobby>
export const CountdownCase = () => <Countdown to={NOW + 4000000} now={NOW} />

function Demo() {
  const items = state(NOTES)
  const conn = state<'live' | 'reconnecting' | 'offline'>('live')
  const read = (id: string) => (items.value = items.value.map(n => (n.id === id ? { ...n, read: true } : n)))
  const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
  const layout = state<any>(q.get('layout') ?? 'gallery')
  const unread = () => items.value.filter(n => !n.read).length
  return (
    <>
      <h1>warp live</h1>
      <h2>App bar</h2>
      <div data-part="app-bar">
        <b>Loom</b>
        <span data-part="spacer"></span>
        <ConnectionPill state={conn} />
        <Bell count={unread} inbox={open => <Inbox variant="popover" items={items} open={open.value} onRead={read} onReadAll={() => (items.value = items.value.map(n => ({ ...n, read: true })))} onDismiss={id => (items.value = items.value.filter(n => n.id !== id))} onRestore={n => (items.value = [n, ...items.value])} viewAll="/notifications" />} />
      </div>
      <ConnectionBanner state={conn} onRetry={() => (conn.value = 'reconnecting')} />
      <Button emphasis="outline" tone="neutral" size="sm" data-go-offline="" onClick={() => (conn.value = conn.value === 'offline' ? 'live' : 'offline')}>Toggle connection</Button>
      <h2>Inbox as a page</h2>
      <div class="inbox-box"><Inbox title="All notifications" items={items} live="live" open={false} onRead={read} onReadAll={() => (items.value = items.value.map(n => ({ ...n, read: true })))} onDismiss={id => (items.value = items.value.filter(n => n.id !== id))} onRestore={n => (items.value = [n, ...items.value])} /></div>
      <ActivityFeed items={ACTIVITY} live="live" />
      <h2>Push</h2>
      <PushSoftAsk onAccept={() => {}} />
      <h2>Connection</h2>
      <LiveRowCase />
      <h2>Preferences</h2>
      <PrefsCase />
      <h2>Transport</h2>
      <h3>Picker</h3>
      <TransportCase />
      <h2>Meeting</h2>
      <div class="room-box"><MeetingRoom title="Design crit" timer="32:14" recording layout={layout} sidebar={q.has('side') ? 'people' : undefined} participants={PEOPLE} self={ME} invite={() => <Button emphasis="outline" tone="neutral" size="sm">Invite people</Button>} chat={() => <p>Chat</p>} share={() => <div></div>} board={() => <div></div>} presenter="Kofi" /></div>
      <h2>Prejoin</h2>
      <PrejoinCase />
      <LobbyCase />
      <ScheduledLobby title="Q4 review starts soon" to={Date.now() + 252000} opensAt="10:50" onAddToCalendar={() => {}}>Join opens 10 minutes before the start.</ScheduledLobby>
      <Toaster />
      <style>{'.room-box{block-size:640px;margin-block:16px}.inbox-box{block-size:480px}'}</style>
    </>
  )
}
export const Part = () => <Demo />
