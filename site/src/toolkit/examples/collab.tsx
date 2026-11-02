import { onCleanup, onMount, state } from 'weft'
import {
  AutoTrack, Button, Card, CommentAnchor, CommentRail, CommentThread, Composer, ConflictAlert, ConversationList, Cursors, DataIntegrity, Following, Heading, Input, LockIndicator, LockedField,
  Message, PeerMark, PeerSelection, PresenceStack, Row, SectionPeers, Segmented, Select, ShareDialog, Spacer, Stack, Switch, SyncIndicator, SyncedForm, Text, Textarea, Thread, Toaster, TypingIndicator, VersionHistory, ViewportRail,
} from '@weft/warp'
import type { ChatConversation, ChatMessage, CommentThreadData, ComposerFile, ComposerSend, CursorPeer, IntegrityEvent, MessageReaction, Peer, ShareLink, ShareMember, ShareRole, SyncState, Version } from '@weft/warp'
import { CHAT, COMMENT_OWNER, COMMENT_TIMEOUTS, CONVERSATIONS, CURSOR_PEERS, INES, INTEGRITY_EVENTS, INTEGRITY_STATS, JUN, LENA, MARA, NOOR, PEERS, PRIYA, SAM, SHARE_MEMBERS, SHARE_PEOPLE, TOMAS, VERSIONS, VIEWPORT_PEERS } from '../world'

const wait = (ms: number) => new Promise(done => setTimeout(done, ms))

const IN_CHANNEL = [SAM, JUN, LENA]
const EARLY_CHAT = CHAT.slice(0, 3)

// -- chat --

export function ThreadIncident() {
  const messages = state(CHAT)
  const typing = state<string[]>([])
  const add = (m: ChatMessage) => (messages.value = [...messages.value, m])
  const send = async ({ text, quote }: ComposerSend) => {
    const id = `m${messages.value.length + 1}`
    add({ id, author: MARA, mine: true, text, quote, time: '09:30', day: 'Today', state: 'sending' })
    await wait(500)
    messages.value = messages.value.map(m => (m.id === id ? { ...m, state: 'sent' } : m))
    typing.value = ['Sam Okafor']
    await wait(1400)
    typing.value = []
    add({ id: `${id}-r`, author: SAM, text: 'Got it, thanks.', time: '09:31', day: 'Today' })
  }
  const react = (m: ChatMessage, r: MessageReaction | null) => {
    const reactions = r ? [{ ...r, count: r.count + 1, mine: true }] : []
    messages.value = messages.value.map(x => (x.id === m.id ? { ...x, reactions } : x))
  }
  return (
    <Thread
      label="incidents channel"
      height="480px"
      messages={messages}
      unreadFrom="m5"
      typing={typing}
      header={<><Text role="label"># incidents</Text><Spacer /><PresenceStack peers={IN_CHANNEL} label="In this channel" /></>}
      onSend={send}
      onReact={react}
      composer={{ label: 'Message #incidents', placeholder: 'Message #incidents', mentions: PEERS }}
    />
  )
}

export const ThreadTile = () => <Message message={CHAT[2]} />

export const ThreadReadOnly = () => <Thread label="Deploy d-4819 discussion" height="240px" messages={EARLY_CHAT} />

export function ConversationListInbox() {
  const open = state('incidents')
  const name = () => CONVERSATIONS.find(c => c.id === open.value)!.name
  return (
    <Stack gap="related">
      <ConversationList title={<Text role="label">Messages</Text>} items={CONVERSATIONS} value={open} />
      <Text subtle>Open: {name()}</Text>
    </Stack>
  )
}

const FAILED: ChatMessage = { id: 'failed', author: MARA, mine: true, time: '09:32', text: 'Sending the graph from my phone', state: 'failed' }

export function MessageKinds() {
  const retried = state(false)
  return (
    <Stack gap="related">
      <Message message={CHAT[1]} />
      <Message message={CHAT[5]} source={CHAT[1]} />
      <Message message={CHAT[7]} />
      <Message message={retried.value ? { ...FAILED, state: 'sent' } : FAILED} last onRetry={() => (retried.value = true)} />
    </Stack>
  )
}

export function ComposerAttach() {
  const files = state<ComposerFile[]>([])
  const sent = state('')
  return (
    <Stack gap="related">
      <Composer
        label="Message #deploys"
        placeholder="Message #deploys"
        mentions={PEERS}
        files={files.value}
        onAttach={() => (files.value = [...files.value, { id: `f${files.value.length}`, name: 'latency-graph.png' }])}
        onRemoveFile={file => (files.value = files.value.filter(f => f !== file))}
        onEmoji={insert => insert('🚀')}
        onSend={m => { sent.value = m.text; files.value = [] }}
      />
      <Text subtle>{sent.value ? `Sent: ${sent.value}` : 'Type @ to mention someone.'}</Text>
    </Stack>
  )
}

export const TypingIndicatorNames = () => (
  <Stack gap="related">
    <TypingIndicator text="Sam is typing…" />
    <TypingIndicator text="Sam and Jun are typing…" />
  </Stack>
)

// -- presence --

export function PresenceStackRoom() {
  const peers = state(PEERS.slice(0, 3))
  const join = () => (peers.value = PEERS.slice(0, peers.value.length + 1))
  const leave = () => (peers.value = peers.value.slice(0, -1))
  return (
    <Stack gap="related" align="center">
      <PresenceStack peers={peers} max={4} />
      <Row gap="tight">
        <Button size="sm" emphasis="outline" tone="neutral" aria-disabled={peers.value.length === PEERS.length ? 'true' : undefined} onClick={join}>Someone joins</Button>
        <Button size="sm" emphasis="ghost" tone="neutral" aria-disabled={peers.value.length < 2 ? 'true' : undefined} onClick={leave}>Someone leaves</Button>
      </Row>
    </Stack>
  )
}

export const PresenceStackOverflow = () => <PresenceStack peers={PEERS} max={3} />

export function FollowingPeer() {
  const peer = state<Peer | null>(null)
  return (
    <Stack gap="related">
      <Row justify="between">
        <Text subtle>Press an avatar to follow them.</Text>
        <PresenceStack peers={IN_CHANNEL} following={peer.value?.id} onFollow={p => (peer.value = p)} />
      </Row>
      <Following peer={peer.value} onStop={() => (peer.value = null)}>
        <Card>
          <Stack gap="related">
            <Heading level={3}>Rollback runbook</Heading>
            <Text subtle>When a deploy fails its health check, roll back first and read the logs second. A failed deploy never blocks the next one.</Text>
          </Stack>
        </Card>
      </Following>
    </Stack>
  )
}

export function CursorsDocument() {
  const peers = state<CursorPeer[]>(CURSOR_PEERS)
  onMount(() => {
    let tick = 0
    const timer = setInterval(() => {
      tick++
      peers.value = CURSOR_PEERS.map((p, i) => ({ ...p, cursor: { ...p.cursor!, x: 0.2 + 0.6 * Math.abs(Math.sin(tick / 2 + i)) } }))
    }, 1400)
    onCleanup(() => clearInterval(timer))
  })
  return (
    <Stack gap="related" style="position:relative">
      <div data-anchor="title"><Heading level={3}>Rollback runbook</Heading></div>
      <div data-anchor="body"><Text subtle>When a deploy fails its health check, roll back first and read the logs second. A failed deploy never blocks the next one, and the person on call owns the call.</Text></div>
      <Cursors peers={peers} idle={3600000} />
    </Stack>
  )
}

export const PeerMarkText = () => (
  <Text>Roll back first, then <PeerMark peer={LENA}>read the logs</PeerMark>. The person on call owns the decision.</Text>
)

export const PeerSelectionText = () => (
  <Text>The stale window is <PeerSelection peer={JUN}>30 seconds</PeerSelection> on every region.</Text>
)

export const LockedFieldOwner = () => (
  <Stack gap="group">
    <LockedField peer={JUN} label="Runbook owner" value="Jun Tanaka" />
    <LockedField peer={null} label="Review date" value="Nov 14" />
  </Stack>
)

export const LockIndicatorPeople = () => (
  <>
    <LockIndicator peer={JUN} />
    <LockIndicator peer={LENA} />
  </>
)

// The rail fills its parent, so the parent sets the height.
const RailHeight = ({ children }: { children: any }) => <div style="display:grid;block-size:180px">{children}</div>

export const ViewportRailDocument = () => <RailHeight><ViewportRail peers={VIEWPORT_PEERS} self={{ top: 0.02, height: 0.3 }} /></RailHeight>

export function ViewportRailJump() {
  const seen = state('Press a box to jump to that person.')
  return (
    <Row gap="group">
      <RailHeight><ViewportRail peers={VIEWPORT_PEERS} self={{ top: 0.02, height: 0.3 }} onJump={p => (seen.value = `Jumped to ${p.name}.`)} /></RailHeight>
      <Text subtle>{seen.value}</Text>
    </Row>
  )
}

export const SectionPeersHeading = () => (
  <Stack gap="related">
    <Row gap="related"><Heading level={3}>When to roll back</Heading><SectionPeers peers={IN_CHANNEL} /></Row>
    <Row gap="related"><Heading level={3}>Who to tell</Heading><SectionPeers peers={ONE_READER} /></Row>
  </Stack>
)

const ONE_READER = [PRIYA]

// -- comments --

const newComment = (text: string) => ({ id: text, author: MARA, time: 'Now', text })

export function CommentThreadReply() {
  const thread = state(COMMENT_TIMEOUTS)
  const reply = (text: string) => (thread.value = { ...thread.value, comments: [...thread.value.comments, newComment(text)] })
  return <CommentThread thread={thread} onReply={reply} />
}

const RESOLVED = { ...COMMENT_OWNER, resolved: true }

export const CommentThreadResolved = () => <CommentThread thread={RESOLVED} />

export function CommentAnchorText() {
  const active = state<string | null>(null)
  return (
    <Stack gap="related">
      <Text>The cache keeps a page for <CommentAnchor thread="c-timeouts" active={active}>60 seconds</CommentAnchor> after a deploy.</Text>
      <Text subtle>{active.value ? 'The thread is active.' : 'Press the highlighted words.'}</Text>
    </Stack>
  )
}

export function CommentRailDocument() {
  const active = state<string | null>('c-timeouts')
  const threads = state<CommentThreadData[]>([COMMENT_TIMEOUTS, COMMENT_OWNER])
  const reply = (id: string, text: string) => (threads.value = threads.value.map(t => (t.id === id ? { ...t, comments: [...t.comments, newComment(text)] } : t)))
  return (
    <Row gap="group" align="start" reflow="tablet">
      <Stack gap="related">
        <Heading level={3}>Rollback runbook</Heading>
        <Text>The cache keeps a page for <CommentAnchor thread="c-timeouts" active={active}>60 seconds</CommentAnchor> after a deploy, so a rollback can take a minute to reach everyone.</Text>
        <Text><CommentAnchor thread="c-owner" active={active}>The person on call</CommentAnchor> decides, and tells support once it is done.</Text>
      </Stack>
      <CommentRail threads={threads} active={active} onReply={reply} />
    </Row>
  )
}

const PREVIEW_LINES: Record<string, string> = { v4: 'Roll back first, then read the logs.', v3: 'Read the logs, then decide.', v2: 'Ask in #incidents.', v1: 'To be written.' }
const versionPreview = (v: Version) => <Text>{PREVIEW_LINES[v.id] ?? v.meta}</Text>

export function VersionHistoryRunbook() {
  const versions = state(VERSIONS)
  const restore = (v: Version) => {
    const [now, ...older] = versions.value
    versions.value = [{ id: `v${versions.value.length + 1}`, title: 'Current', meta: `Restored from "${v.title}"`, current: true }, { ...now, title: 'Before the restore', current: false }, ...older]
  }
  return <VersionHistory versions={versions} preview={versionPreview} onRestore={restore} />
}

export function ShareDialogRunbook() {
  const open = state(false)
  const members = state<ShareMember[]>(SHARE_MEMBERS)
  const link = state<ShareLink>({ access: 'restricted', role: 'viewer' })
  const invite = (emails: string[], role: ShareRole) => {
    const added = emails.map(email => ({ id: email, name: email.split('@')[0], email, role }))
    members.value = [...members.value, ...added]
  }
  const change = (m: ShareMember, role: ShareRole | null) => {
    members.value = role ? members.value.map(x => (x.id === m.id ? { ...x, role } : x)) : members.value.filter(x => x !== m)
  }
  return (
    <>
      <Stack gap="related" align="center">
        <PresenceStack peers={members.value} />
        <Button icon="share" onClick={() => (open.value = true)}>Share</Button>
      </Stack>
      <ShareDialog open={open} title="Rollback runbook" members={members} people={SHARE_PEOPLE} link={link} url="https://tessel.dev/d/rollback-runbook" onInvite={invite} onRoleChange={change} onLinkAccess={v => (link.value = v)} />
      <Toaster />
    </>
  )
}

// -- sync --

const SYNC_STATES: SyncState[] = ['saved', 'saving', 'offline']

export const SyncIndicatorStates = () => (
  <>
    {SYNC_STATES.map(s => <SyncIndicator key={s} state={s} />)}
  </>
)

export function SyncIndicatorTitle() {
  const sync = state<SyncState>('saved')
  let timer: ReturnType<typeof setTimeout> | undefined
  const edit = () => {
    sync.value = 'saving'
    clearTimeout(timer)
    timer = setTimeout(() => (sync.value = 'saved'), 900)
  }
  onCleanup(() => clearTimeout(timer))
  return (
    <Stack gap="related">
      <Row justify="between"><Text role="label">Rollback runbook</Text><SyncIndicator state={sync.value} /></Row>
      <Textarea label="Notes" defaultValue="Roll back first, then read the logs." onInput={edit} />
    </Stack>
  )
}

export function ConflictAlertReviewDate() {
  const picked = state<string | null>(null)
  return (
    <>
      {picked.value
        ? <Stack gap="related" align="center"><Text>Review date: {picked.value}</Text><Button size="sm" emphasis="ghost" tone="neutral" onClick={() => (picked.value = null)}>Show the conflict again</Button></Stack>
        : <ConflictAlert field="Review date" peer={JUN} time="10:31" theirs="Nov 21" yours="Nov 14" onUseTheirs={() => (picked.value = 'Nov 21')} onKeepMine={() => (picked.value = 'Nov 14')} />}
    </>
  )
}

const OWNERS = [{ value: 'jun', label: 'Jun Tanaka' }, { value: 'sam', label: 'Sam Okafor' }]

export function SyncedFormRunbook() {
  const ops = state<{ seq: number; name: string; value: string | boolean; peer: Peer }[]>([])
  const remote = (name: string, value: string | boolean) => (ops.value = [...ops.value, { seq: ops.value.length + 1, name, value, peer: JUN }])
  return (
    <Stack gap="group">
      <SyncedForm ops={ops} label="Runbook details">
        <Input label="Title" name="title" defaultValue="Rollback runbook" />
        <Select label="Owner" name="owner" options={OWNERS} defaultValue="sam" />
        <Switch name="notify" defaultChecked>Tell #incidents</Switch>
      </SyncedForm>
      <Row gap="tight">
        <Button size="sm" emphasis="outline" tone="neutral" onClick={() => remote('title', 'Rollback runbook v2')}>Jun edits the title</Button>
        <Button size="sm" emphasis="outline" tone="neutral" onClick={() => remote('notify', false)}>Jun flips the switch</Button>
      </Row>
    </Stack>
  )
}

export function DataIntegrityChannel() {
  const stats = state(INTEGRITY_STATS)
  const events = state<IntegrityEvent[]>(INTEGRITY_EVENTS)
  const log = (note: string, change: Partial<typeof INTEGRITY_STATS>) => {
    const seq = stats.value.sent + 1
    stats.value = { ...stats.value, sent: seq, ...change }
    events.value = [{ id: `e${seq}`, seq, kind: 'title', route: 'You → Jun', note, lag: 40 }, ...events.value].slice(0, 5)
  }
  return (
    <DataIntegrity
      channel="runbook:rollback" stats={stats} events={events} live="live"
      onInjectDuplicate={() => log('duplicate, ignored', { duplicate: stats.value.duplicate + 1 })}
      onInjectReorder={() => log('out of order', { outOfOrder: stats.value.outOfOrder + 1 })}
      onReset={() => { stats.value = { sent: 0, received: 0, duplicate: 0, outOfOrder: 0, lagP95: 0 }; events.value = [] }}
    />
  )
}

const PARTS = [{ value: 'detect', label: 'Detect' }, { value: 'roll', label: 'Roll back' }, { value: 'tell', label: 'Tell people' }]

export function AutoTrackPresenter() {
  const section = state('detect')
  return (
    <Stack gap="related">
      <Segmented label="Jun presents" size="sm" value={section.value} options={PARTS} onChange={v => (section.value = v)} />
      <AutoTrack presenter={JUN} section={section.value} label="Rollback runbook" height={180}>
        <Stack gap="section">
          <section data-section="detect"><Heading level={4}>Detect</Heading><Text subtle>A failed health check pages the person on call within a minute. The deploy stops on its own and nothing else ships until someone looks.</Text></section>
          <section data-section="roll"><Heading level={4}>Roll back</Heading><Text subtle>One press puts the last good deploy back. It takes about thirty seconds to reach every region, and the edge cache follows.</Text></section>
          <section data-section="tell"><Heading level={4}>Tell people</Heading><Text subtle>Post in #incidents, then tell support what customers saw and when it ended. Write the timeline while it is fresh.</Text></section>
        </Stack>
      </AutoTrack>
    </Stack>
  )
}
