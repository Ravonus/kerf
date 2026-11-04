// The collab pack on the a11y gallery (?part=collab): rendered by test/a11y/gallery.tsx. `?share`, `?history`, `?quote`
// open those states. Fixtures import per file: the query imports only follow .tsx.
import { state } from '@weft-js/core'
import type { ChatMessage, CursorPeer, FormOp, IntegrityStats, Peer } from '@weft-js/warp-core'
import { Input } from '../../src/Field'
import { Select } from '../../src/Select'
import { Switch } from '../../src/Choice'
import { Button } from '../../src/Button'
import { Toaster } from '../../src/Toast'
import { AutoTrack } from '../../src/collab/AutoTrack'
import {
  CommentAnchor,
  CommentRail,
  CommentThread,
  type CommentThreadData,
} from '../../src/collab/Comments'
import { ConversationList, type ChatConversation } from '../../src/collab/ConversationList'
import { Composer, TypingIndicator } from '../../src/collab/Composer'
import { Cursors, PeerMark, PeerSelection } from '../../src/collab/Cursors'
import { DataIntegrity, type IntegrityEvent } from '../../src/collab/DataIntegrity'
import { Kanban, type KanbanColumn } from '../../src/collab/Kanban'
import { LockedField } from '../../src/collab/Lock'
import { Following, PresenceStack } from '../../src/collab/PresenceStack'
import { ShareDialog, type ShareLink, type ShareMember } from '../../src/collab/ShareDialog'
import { ConflictAlert, SyncIndicator } from '../../src/collab/Status'
import { SyncedForm } from '../../src/collab/SyncedForm'
import { Thread } from '../../src/collab/Thread'
import { SectionPeers, ViewportRail, type ViewportPeer } from '../../src/collab/ViewportRail'
import { VersionHistory, type Version } from '../../src/collab/VersionHistory'

export const mei: Peer = { id: 'mei', name: 'Mei Tanaka', color: 3 }
export const ana: Peer = { id: 'ana', name: 'Ana Ruiz', color: 1 }
export const kofi: Peer = { id: 'kofi', name: 'Kofi Mensah', color: 2 }
export const raj: Peer = { id: 'raj', name: 'Raj Patel', color: 4 }
export const lea: Peer = { id: 'lea', name: 'Léa Martin', color: 5 }
export const sam: Peer = { id: 'sam', name: 'Sam Okafor', color: 7 }
const me: Peer = { id: 'me', name: 'Jo Lind', color: 6 }

const min = 60_000
const t0 = 1_800_000_000_000
export const messages: ChatMessage[] = [
  {
    id: 'm1',
    author: ana,
    time: '16:02',
    at: t0,
    day: 'Yesterday',
    text: 'Pushed the agenda-first phone view. Swipe between days feels right now.',
  },
  {
    id: 'm2',
    author: ana,
    time: '16:03',
    at: t0 + min,
    day: 'Yesterday',
    text: 'Long-press opens the move sheet instead of a drag, so scrolling never fights it.',
  },
  {
    id: 'm3',
    author: kofi,
    time: '16:20',
    at: t0 + 18 * min,
    day: 'Yesterday',
    text: 'Edge cases from the DST bug, for reference.',
    attachment: { kind: 'PDF', name: 'dst-cases.pdf', meta: '212 KB · 4 pages' },
    replies: { count: 2, last: '17:40', people: [mei, ana] },
  },
  {
    id: 'm4',
    author: mei,
    time: '09:48',
    at: t0 + 1000 * min,
    day: 'Today',
    text: 'Overlap layout is in. Third column spans when the right side is free, like you asked @you.',
    mentions: ['you'],
    reactions: [
      { emoji: '👍', label: 'Thumbs up', count: 3, mine: true, names: ['you', 'Ana', 'Kofi'] },
      { emoji: '🎉', label: 'Party', count: 2, names: ['Ana', 'Kofi'] },
    ],
  },
  {
    id: 'm5',
    author: me,
    mine: true,
    time: '09:51',
    at: t0 + 1003 * min,
    day: 'Today',
    text: 'Nice. Does the now line still sweep in on load?',
    state: 'read',
    readAt: '09:52',
  },
  {
    id: 'm6',
    author: mei,
    time: '09:52',
    at: t0 + 1004 * min,
    day: 'Today',
    text: 'Once, on mount. Reduced motion just shows it.',
  },
  {
    id: 'm7',
    author: ana,
    time: '09:53',
    at: t0 + 1005 * min,
    day: 'Today',
    quote: { ref: 'm4', text: 'Third column spans when the right side is free' },
    text: 'Does it span left too, when the left side is free?',
  },
  {
    id: 'm8',
    author: me,
    mine: true,
    time: '09:55',
    at: t0 + 1007 * min,
    day: 'Today',
    text: 'Sending the screenshot from my phone',
    state: 'failed',
  },
]
const conversations: ChatConversation[] = [
  {
    id: 'cal',
    name: '# calendar-engine',
    color: 3,
    channel: true,
    preview: 'Mei: Overlap layout is in…',
    time: '09:52',
    unread: 2,
  },
  {
    id: 'ana',
    name: 'Ana Ruiz',
    color: 1,
    preview: 'You: sounds good',
    time: '09:30',
    online: true,
  },
  {
    id: 'crit',
    name: '# design-crit',
    color: 5,
    channel: true,
    preview: 'Léa: new frames up',
    time: 'Tue',
    unread: 5,
    pinned: true,
  },
  {
    id: 'rel',
    name: '# releases',
    color: 4,
    channel: true,
    preview: 'Raj pinned a message',
    time: 'Mon',
    muted: true,
  },
]
const cursors: CursorPeer[] = [
  mei,
  kofi,
  ana,
  raj,
  lea,
  sam,
  me,
  { id: 'eve', name: 'Eve Lund', color: 8 },
].map((p, i) => ({ ...p, cursor: { anchor: i % 2 ? 'p1' : 'h1', x: 0.1 * (i + 1), y: 0.6 } }))
const rail: ViewportPeer[] = [
  { ...mei, top: 0.18, height: 0.36 },
  { ...kofi, top: 0.52, height: 0.36 },
]
const threadOne: CommentThreadData = {
  id: 'c1',
  comments: [
    {
      id: 'a',
      author: lea,
      time: '10:12',
      text: 'Should the slots skip times that clash with the user’s own calendar?',
    },
    { id: 'b', author: mei, time: '10:20', text: 'Disable, don’t hide, so the grid doesn’t jump.' },
  ],
}
const threadTwo: CommentThreadData = {
  id: 'c2',
  comments: [
    { id: 'c', author: raj, time: 'Mon', text: 'Ship date depends on the DST fix landing.' },
  ],
}
const board: KanbanColumn[] = [
  {
    id: 'todo',
    title: 'To do',
    color: 8,
    cards: [
      { id: 'k1', title: 'Year view', label: 'Design', color: 7, assignee: 'AR' },
      { id: 'k2', title: 'Availability editor', label: 'Platform', color: 5 },
    ],
  },
  {
    id: 'doing',
    title: 'Doing',
    color: 1,
    limit: 2,
    cards: [
      { id: 'k3', title: 'Overlap layout' },
      { id: 'k4', title: 'Move sheet' },
      { id: 'k5', title: 'Now line' },
    ],
  },
  { id: 'done', title: 'Done', color: 4, cards: [{ id: 'k6', title: 'Agenda view' }] },
]
const versions: Version[] = [
  { id: 'v4', title: 'Current', meta: 'Kofi, Mei, you · now', current: true },
  { id: 'v3', title: 'Before the overlap rewrite', meta: 'Mei · 10:02', named: true },
  { id: 'v2', title: 'Autosave', meta: 'You · 09:41' },
  { id: 'v1', title: 'First draft', meta: 'Ana · Mon', named: true },
]
const members: ShareMember[] = [
  { ...me, email: 'jo@loom.app', role: 'owner' },
  { ...mei, email: 'mei@loom.app', role: 'editor' },
  { ...ana, email: 'ana@loom.app', role: 'commenter' },
]
const stats: IntegrityStats = { sent: 12, received: 11, duplicate: 1, outOfOrder: 1, lagP95: 54 }
const events: IntegrityEvent[] = [
  { id: 'e2', seq: 12, kind: 'title', route: 'Ana → you', lag: 31 },
  { id: 'e1', seq: 11, kind: 'room', route: 'Ana → you', note: 'duplicate, ignored', lag: 54 },
]
const ops: FormOp[] = []

const send = () => {}

export const ChatCase = () => (
  <div style="block-size:560px;display:grid">
    <Thread
      label="calendar-engine channel"
      messages={messages}
      unreadFrom="m4"
      typing={['Mei Tanaka']}
      header={
        <>
          <b># calendar-engine</b>
          <span data-part="spacer"></span>
          <PresenceStack peers={[mei, ana, kofi]} />
        </>
      }
      onSend={send}
      composer={{
        label: 'Message #calendar-engine',
        mentions: [mei, ana, kofi],
        onAttach: send,
        onEmoji: send,
      }}
    />
  </div>
)
export const ListCase = () => (
  <ConversationList title={<b>Messages</b>} items={conversations} value="cal" />
)
export const ComposerCase = () => (
  <Composer label="Message" onSend={send} mentions={[mei]} compact />
)
export const TypingCase = () => <TypingIndicator text="Mei is typing…" />
export const PresenceCase = () => (
  <PresenceStack peers={[mei, kofi, ana, raj, lea, sam]} max={3} onFollow={send} following="mei" />
)
export const FollowingCase = () => (
  <Following peer={mei} onStop={send}>
    <p>Shared brief</p>
  </Following>
)
export const CursorsCase = () => (
  <div style="position:relative;block-size:120px">
    <h2 data-anchor="h1">Heading</h2>
    <p data-anchor="p1">Paragraph</p>
    <Cursors peers={cursors} />
  </div>
)
export const StatusCase = () => (
  <>
    <SyncIndicator state="saved" />
    <SyncIndicator state="saving" />
    <SyncIndicator state="offline" />
    <ConflictAlert
      field="Ship date"
      peer={ana}
      time="10:31"
      theirs="Nov 25"
      yours="Nov 18"
      onUseTheirs={send}
      onKeepMine={send}
      onCompare={send}
    />
  </>
)
export const LockCase = () => <LockedField peer={kofi} label="Owner" value="Kofi Mensah" />
export const RailCase = () => (
  <>
    <ViewportRail peers={rail} self={{ top: 0.05, height: 0.38 }} />
    <SectionPeers peers={[mei, ana]} />
  </>
)
export const CommentCase = () => (
  <>
    <CommentThread thread={threadOne} />
    <CommentThread thread={{ ...threadTwo, resolved: true }} />
  </>
)
export const AnchoredCase = () => {
  const active = state<string | null>('c1')
  return (
    <>
      <p>
        <CommentAnchor thread="c1" active={active}>
          move sheet
        </CommentAnchor>
      </p>
      <CommentRail threads={[threadOne, threadTwo]} active={active} />
    </>
  )
}
export const VersionsCase = () => <VersionHistory versions={versions} onRestore={send} />
export const KanbanCase = () => <Kanban columns={board} />
export const FormCase = () => (
  <SyncedForm ops={ops} label="Your copy">
    <Input label="Event title" name="title" value="Design crit" />
  </SyncedForm>
)
export const IntegrityCase = () => (
  <DataIntegrity channel="event:812" stats={stats} events={events} live="live" />
)
export const TrackCase = () => (
  <AutoTrack presenter={kofi} section="a" label="Shared brief">
    <section data-section="a">Agenda</section>
  </AutoTrack>
)

export const Part = () => {
  const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
  const share = state(params.has('share'))
  const link = state<ShareLink>({ access: 'anyone', role: 'viewer' })
  const active = state<string | null>('c1')
  const follow = state<Peer | null>(null)
  const peers = [mei, kofi, ana, raj, lea, sam]
  return (
    <>
      <h1>warp collab</h1>
      <h2>Chat</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));grid-auto-rows:minmax(0,640px);border:1px solid var(--warp-color-border)">
        <ConversationList title={<b>Messages</b>} items={conversations} value="cal" />
        <Thread
          label="calendar-engine channel"
          messages={messages}
          unreadFrom="m4"
          typing={['Mei Tanaka', 'Ana Ruiz']}
          header={
            <>
              <b># calendar-engine</b>
              <span data-part="spacer"></span>
              <PresenceStack peers={[mei, ana, kofi]} label="In this channel" />
            </>
          }
          onSend={send}
          composer={{
            label: 'Message #calendar-engine',
            mentions: [mei, ana, kofi, raj],
            onAttach: send,
            onEmoji: send,
            files: [{ id: 'f', name: 'screenshot.png' }],
          }}
        />
      </div>
      <h2>Shared brief</h2>
      <Following peer={follow.value} onStop={() => (follow.value = null)}>
        <div data-part="app-bar">
          <b>Q4 brief</b>
          <SyncIndicator state="saved" />
          <span data-part="spacer"></span>
          <PresenceStack
            peers={peers}
            onFollow={(p) => (follow.value = p)}
            following={follow.value?.id}
          />
          <Button size="sm" onClick={() => (share.value = true)}>
            Share
          </Button>
        </div>
        <div style="position:relative;display:grid;grid-template-columns:44px minmax(0,1fr);gap:20px;padding:16px">
          <div style="block-size:240px;display:grid">
            <ViewportRail peers={rail} self={{ top: 0.05, height: 0.38 }} onJump={send} />
          </div>
          <article style="display:grid;gap:14px;max-inline-size:640px">
            <h3 data-anchor="h1">
              Agenda first, drag second <SectionPeers peers={[mei]} />
            </h3>
            <p data-anchor="p1">
              Phones open on the agenda, because touch scheduling is mostly{' '}
              <PeerMark peer={mei}>reading and rescheduling</PeerMark>. Long-press opens a{' '}
              <CommentAnchor thread="c1" active={active}>
                move sheet with real slots
              </CommentAnchor>
              ; events <PeerSelection peer={ana}>span right while the lanes are free</PeerSelection>
              .
            </p>
            <LockedField peer={kofi} label="Owner" value="Kofi Mensah" />
            <ConflictAlert
              field="Ship date"
              peer={ana}
              time="10:31"
              theirs="Nov 25"
              yours="Nov 18"
              onUseTheirs={send}
              onKeepMine={send}
              onCompare={send}
            />
          </article>
          {/* the audits outlast the idle fade, which is decorative and 40% by design: they read the active label */}
          <Cursors peers={cursors} idle={3600000} />
        </div>
        <CommentRail threads={[threadOne, threadTwo]} active={active} />
      </Following>
      <h2>Versions</h2>
      <VersionHistory
        versions={versions}
        preview={(v) => (
          <p>
            {v.title}: <ins>new line</ins>
          </p>
        )}
        onRestore={send}
      />
      <h2>Board</h2>
      <Kanban columns={board} onAdd={send} />
      <h2>Synced form</h2>
      <SyncedForm ops={ops} label="Your copy">
        <Input label="Event title" name="title" value="Design crit" />
        <Select
          label="Room"
          name="room"
          options={[
            { value: 'atlas', label: 'Atlas' },
            { value: 'cedar', label: 'Cedar' },
          ]}
        />
        <Switch name="notify" defaultChecked>
          Notify attendees
        </Switch>
      </SyncedForm>
      <DataIntegrity channel="event:812" stats={stats} events={events} live="live" />
      <h2>Auto-track</h2>
      <AutoTrack presenter={kofi} section="b" label="Shared brief (scrolls)">
        <section data-section="a">
          <h3>Agenda</h3>
          <p>Notes for the agenda.</p>
        </section>
        <section data-section="b">
          <h3>Overlap layout</h3>
          <p>Notes for the layout.</p>
        </section>
      </AutoTrack>
      <ShareDialog
        open={share}
        title="Q4 brief"
        members={members}
        people={[{ ...kofi, email: 'kofi@loom.app' }]}
        link={link}
        url="https://loom.app/d/q4"
        onInvite={send}
        onRoleChange={send}
        onLinkAccess={(v) => (link.value = v)}
      />
      <Toaster />
    </>
  )
}
