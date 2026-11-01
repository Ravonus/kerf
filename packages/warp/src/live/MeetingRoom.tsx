import { ChatIcon, HandIcon, ScreenIcon, SmileIcon, UsersIcon } from '@weft/icons'
import { announce, floatReaction, galleryCols, hueOf, installSweep, newHands, pauseOffscreen, pip, speakerFollow, speakingOut, tileLabel, toolbar, type LiveState, type ParticipantLike, type PipCorner } from '@weft/ui-core'
import { derived, onCleanup, onMount, state, untrack, watch, type State } from 'weft'
import { Avatar, LiveStatus } from '../parts'
import { Button } from '../Button'
import { Segmented } from '../Choice'
import { use } from '../use'
import { avatarTint, G, held, val, type GlyphName } from './shared'
import '../styles'
import '@weft/ui-core/styles/app/base.css'
import '@weft/ui-core/styles/app/room.css'
import '@weft/ui-core/styles/app/tile.css'
import '@weft/ui-core/styles/app/pip.css'
import '@weft/ui-core/styles/app/call-controls.css'

export type MeetingLayout = 'gallery' | 'speaker' | 'presentation' | 'board'
export interface Participant extends ParticipantLike { isCamOn?: boolean }
type Video = (p: Participant) => any

const LAYOUTS: [MeetingLayout, string, GlyphName][] = [['gallery', 'Gallery', 'grid'], ['speaker', 'Speaker', 'speaker'], ['presentation', 'Presentation', 'present'], ['board', 'Board', 'board']]

/**
 * A tile (07 §3.1): video slot or avatar, name chip with level bars, flags with words in the name. The speaking ring is
 * the sweep: `data-speaking`, then `data-speaking-out` until it has left. The bars read `--level`: set it on the tile
 * (`[data-pid]`) at whatever rate the audio arrives; nothing re-renders.
 */
export function Tile({ p, self, video, role = 'group' }: { p: Participant; self?: boolean; video?: Video; role?: string }) {
  let el: HTMLDivElement | undefined
  use(speakingOut, () => el, () => !!p.isSpeaking)
  const label = derived(() => tileLabel(self ? { ...p, name: `${p.name}, you` } : p))
  const slot = untrack(() => video)
  const camera = derived(() => !!slot && p.isCamOn !== false)
  return (
    <div
      ref={(n: any) => (el = n)}
      data-scope="tile"
      role={role}
      tabindex="-1"
      aria-label={label.value}
      data-pid={p.id}
      data-speaking={p.isSpeaking ? '' : undefined}
      data-hand={p.handRaised ? '' : undefined}
      data-network={p.network === 'poor' ? 'poor' : undefined}
      data-cam={p.isCamOn === false ? 'off' : undefined}
      style={`--_hue:var(--warp-color-data-${hueOf(p.id)})`}
    >
      {camera.value ? <div data-part="video">{slot!(p)}</div> : <Avatar name={p.name} size="xl" style={avatarTint(p.id)} />}
      <span data-part="flags">
        {p.handRaised && <span data-part="flag" data-kind="hand" title="Hand raised"><G name="hand" /></span>}
        {p.network === 'poor' && <span data-part="flag" data-tone="caution" title="Poor connection"><G name="signal" /></span>}
        {p.isMuted && <span data-part="flag" data-tone="critical" title="Muted"><G name="micoff" /></span>}
      </span>
      <span data-part="name">
        {!p.isMuted && <span data-part="level"><i></i><i></i><i></i></span>}
        {self ? 'You' : p.name}
        {p.role ? <small> · {p.role}</small> : null}
      </span>
    </div>
  )
}

export interface ControlBarProps {
  mic: boolean
  camera: boolean
  sharing?: boolean
  hand?: boolean
  side?: 'people' | 'chat' | null
  /** Icons only, no Chat or People (they go in More), and Leave icon-only (07 §3.3). */
  compact?: boolean
  onToggle: (control: 'mic' | 'camera' | 'share' | 'hand' | 'react' | 'chat' | 'people' | 'more') => void
  onLeave?: () => void
  /** Stands in for the control's name while a control has an open menu of its own. */
  more?: string
}

// the visible label is inside the name (WCAG 2.5.3), and the name stays when the label hides
function Control({ c, name, icon, pressed, device, label, first, onToggle }: any) {
  return (
    <button type="button" data-part="control" data-kind={device ? 'device' : undefined} aria-pressed={pressed ? 'true' : 'false'} aria-label={name} tabindex={first ? '0' : '-1'} onClick={() => onToggle(c)}>
      <G name={icon} /><span data-part="label">{label}</span>
    </button>
  )
}

/** ControlBar (07 §3.2, §3.4): an APG toolbar. One tab stop, arrows between controls, Tab leaves; Leave is the only solid. */
export function ControlBar({ mic, camera, sharing, hand, side, compact, onToggle, onLeave, more = 'More options' }: ControlBarProps) {
  let bar: HTMLDivElement | undefined
  use(toolbar, () => bar, () => ({ items: '[data-part="control"], [data-part="leave"]' }))
  return (
    <div ref={(n: any) => (bar = n)} data-scope="call-controls" role="toolbar" aria-label="Meeting controls">
      <div data-part="group">
        <Control onToggle={onToggle} c="mic" name={mic ? 'Microphone, mute' : 'Microphone, unmute'} icon={mic ? 'mic' : 'micoff'} pressed={mic} device label={mic ? 'Mute' : 'Unmute'} first />
        <Control onToggle={onToggle} c="camera" name={camera ? 'Camera, stop video' : 'Camera, start video'} icon={camera ? 'cam' : 'camoff'} pressed={camera} device label={camera ? 'Stop video' : 'Start video'} />
      </div>
      <div data-part="group">
        <Control onToggle={onToggle} c="share" name="Share screen" icon={ScreenIcon} pressed={sharing} label="Share" />
        <Control onToggle={onToggle} c="hand" name={hand ? 'Lower hand' : 'Raise hand'} icon={HandIcon} pressed={hand} label={hand ? 'Lower hand' : 'Raise hand'} />
        <Control onToggle={onToggle} c="react" name="React" icon={SmileIcon} label="React" />
        {!compact && <Control onToggle={onToggle} c="chat" name="Chat" icon={ChatIcon} pressed={side === 'chat'} label="Chat" />}
        {!compact && <Control onToggle={onToggle} c="people" name="People" icon={UsersIcon} pressed={side === 'people'} label="People" />}
        <button type="button" data-part="control" aria-label={more} tabindex="-1" onClick={() => onToggle('more')}><G name="more" /></button>
      </div>
      <Button tone="critical" data-part="leave" aria-label="Leave meeting" data-icon-only={compact ? '' : undefined} tabindex="-1" onClick={() => onLeave?.()}><G name="leave" />{compact ? null : 'Leave'}</Button>
    </div>
  )
}

export interface MeetingRoomProps {
  title: string
  participants: Participant[] | { value: Participant[] } | (() => Participant[])
  self: Participant
  layout?: State<MeetingLayout> | MeetingLayout
  onLayoutChange?: (l: MeetingLayout) => void
  /** Elapsed time, already formatted (the caller owns the clock). */
  timer?: any
  recording?: boolean
  /** The room's connection: `room.status`, mapped. */
  live?: string | (() => string)
  /** Phone: speaker layout, no switcher, icon-only Leave. Unset: decided by the room's own width after mount. */
  compact?: boolean
  /** Dark island by default (07 §7). */
  theme?: 'dark' | 'light'
  /** Media is the caller's: warp never touches getUserMedia. Return the <video> for a participant. */
  video?: Video
  /** The shared screen, for presentation layout. */
  share?: () => any
  presenter?: string
  shareTitle?: string
  board?: () => any
  /** The Chat panel's body. */
  chat?: () => any
  /** Below People: "Invite people". */
  invite?: () => any
  mic?: State<boolean> | boolean
  camera?: State<boolean> | boolean
  hand?: State<boolean> | boolean
  sharing?: State<boolean> | boolean
  sidebar?: State<'people' | 'chat' | null> | 'people' | 'chat' | null
  reaction?: string
  onMic?: (on: boolean) => void
  onCamera?: (on: boolean) => void
  onHand?: (on: boolean) => void
  onShare?: (on: boolean) => void
  onReact?: (emoji: string) => void
  onLeave?: () => void
  /** More: replaces the phone's default, which opens the People and Chat panel. */
  onMore?: () => void
}

/**
 * MeetingRoom (07 §3): header, stage in four layouts, sidebar, ControlBar. A dark island unless told otherwise. Speaker
 * follows the active speaker with a 1.5 s hold, off-screen video pauses, hands are announced and speakers aren't.
 */
export function MeetingRoom({ title, participants, self, layout, onLayoutChange, timer, recording, live = 'live', compact, theme = 'dark', video, share, presenter, shareTitle = 'Shared screen', board, chat, invite, mic, camera, hand, sharing, sidebar, reaction = '🎉', onMic, onCamera, onHand, onShare, onReact, onLeave, onMore }: MeetingRoomProps) {
  const people = derived(() => (val(participants as any) ?? []) as Participant[])
  const narrow = state(false)
  const phone = derived(() => compact ?? narrow.value)
  const chosen = held<MeetingLayout>(() => layout, untrack(() => compact) ? 'speaker' : 'gallery', () => onLayoutChange)
  const micOn = held<boolean>(() => mic, true, () => onMic)
  const camOn = held<boolean>(() => camera, true, () => onCamera)
  const handUp = held<boolean>(() => hand, false, () => onHand)
  const sharingOn = held<boolean>(() => sharing, false, () => onShare)
  const side = held<'people' | 'chat' | null>(() => sidebar, null)
  const L = derived<MeetingLayout>(() => (sharingOn.value ? 'presentation' : phone.value && chosen.value === 'gallery' ? 'speaker' : chosen.value))
  const speaking = derived(() => people.value.find(p => p.isSpeaking)?.id)
  const speaker = state<string | undefined>(untrack(() => speaking.value ?? people.value[0]?.id))
  const main = derived(() => people.value.find(p => p.id === speaker.value) ?? people.value[0])
  const others = derived(() => people.value.filter(p => p.id !== main.value?.id))
  const me = derived<Participant>(() => ({ ...self, isMuted: !micOn.value, handRaised: handUp.value, isCamOn: camOn.value }))
  const cols = derived(() => galleryCols(people.value.length))
  const network = derived<LiveState>(() => { const s = val(live as any); return s === 'open' || s === 'live' ? 'live' : s === 'reconnecting' ? 'reconnecting' : s === 'connecting' ? 'connecting' : 'offline' })
  const netWords = derived(() => (network.value === 'live' ? 'Good connection' : network.value === 'reconnecting' ? 'Reconnecting…' : network.value === 'connecting' ? 'Connecting…' : 'Offline'))
  const presenterText = derived(() => (sharingOn.value ? 'You are presenting' : `${presenter ?? 'Someone'} is presenting`))
  const shareSlot = untrack(() => share)
  const boardSlot = untrack(() => board)
  const chatSlot = untrack(() => chat)
  const inviteSlot = untrack(() => invite)
  const heading = untrack(() => timer)
  const v = untrack(() => video)
  let root: HTMLDivElement | undefined
  let stage: HTMLDivElement | undefined
  let box: HTMLElement | undefined

  const say = (text: string) => announce(root!.ownerDocument, text)
  onMount(() => {
    const follow = speakerFollow(id => (speaker.value = id))
    follow.update(untrack(() => speaker.value))
    watch(() => speaking.value, s => follow.update(s))
    watch(() => people.value, (next, prev) => { if (prev) for (const p of newHands(prev, next)) say(`${p.name} raised a hand`) })
    onCleanup(() => follow.destroy())
    const RO = (root!.ownerDocument.defaultView as any).ResizeObserver
    if (RO && untrack(() => compact) === undefined) {
      const ro = new RO((es: any[]) => { narrow.value = es[0].contentRect.width < 600 })
      ro.observe(root!)
      onCleanup(() => ro.disconnect())
    }
  })
  use(pauseOffscreen, () => stage)
  const toggle = (c: string) => {
    if (c === 'mic') { micOn.set(!micOn.value); say(micOn.value ? 'Microphone on' : 'Microphone off') }
    if (c === 'camera') { camOn.set(!camOn.value); say(camOn.value ? 'Camera on' : 'Camera off') }
    if (c === 'hand') { handUp.set(!handUp.value); say(handUp.value ? 'Hand raised' : 'Hand lowered') }
    if (c === 'share') { sharingOn.set(!sharingOn.value); say(sharingOn.value ? 'You are presenting' : 'Stopped presenting') }
    if (c === 'chat' || c === 'people') side.set(side.value === c ? null : c)
    if (c === 'react') { floatReaction(stage!, reaction); onReact?.(reaction); say('You reacted') }
    if (c === 'more') { if (onMore) onMore(); else if (phone.value) side.set(side.value ? null : 'people') }
  }
  const closeSide = () => {
    side.set(null)
    root?.querySelector<HTMLElement>('[data-scope="call-controls"] [data-part="control"][tabindex="0"]')?.focus()
  }
  const sideKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !root!.matches(':has([data-scope="call-controls"] :focus)')) closeSide() }
  const pipStart = derived<PipCorner>(() => (phone.value ? 'top-right' : 'bottom-right'))
  let pipEl: HTMLDivElement | undefined
  use(pip, () => pipEl, () => ({ corner: pipStart.value, onMove: (c: PipCorner) => say(`Self view moved to ${c.replace('-', ' ')}`) }))

  return (
    <div ref={(n: any) => (root = n)} data-scope="room" data-part="root" data-theme={theme} role="region" aria-label={`${title} meeting`}>
      <div data-part="header">
        <b>{title}</b>
        {heading !== undefined && <span data-numeric="">{heading}</span>}
        {recording && <span data-part="rec"><span data-scope="status-dot" data-tone="critical"></span>Rec</span>}
        <span data-part="spacer"></span>
        {!phone.value && <Segmented label="Layout" size="sm" value={L.value} options={LAYOUTS.map(l => ({ value: l[0], label: <><G name={l[2]} />{l[1]}</> }))} onChange={(l: MeetingLayout) => { chosen.set(l); if (sharingOn.value) sharingOn.set(false); say(`${l[0].toUpperCase()}${l.slice(1)} layout`) }} />}
        <LiveStatus state={network.value} label="Connection">{phone.value ? '' : netWords.value}</LiveStatus>
      </div>
      <div ref={(n: any) => (stage = n)} data-part="stage" data-layout={L.value} style={`--_cols:${cols.value}`} role="group" aria-label="Participants">
        {L.value === 'gallery' && <div data-part="tiles" role="list" aria-label="Participants">{people.value.map(p => <Tile key={p.id} p={p} video={v} role="listitem" />)}</div>}
        {L.value === 'speaker' && main.value && <Tile key={main.value.id} p={main.value} video={v} />}
        {L.value === 'speaker' && <div data-part="strip" role="list" aria-label="Other participants">{others.value.map(p => <Tile key={p.id} p={p} video={v} role="listitem" />)}</div>}
        {L.value === 'presentation' && (
          <div data-part="share">
            <header><G name="screen" /> {presenterText.value} · {shareTitle}{sharingOn.value && <Button tone="critical" size="sm" onClick={() => toggle('share')}>Stop sharing</Button>}</header>
            {shareSlot ? shareSlot() : <div></div>}
          </div>
        )}
        {L.value === 'board' && (
          <div data-part="share">
            <header><G name="board" /> Whiteboard · everyone can draw</header>
            {boardSlot ? boardSlot() : <div></div>}
          </div>
        )}
        {(L.value === 'presentation' || L.value === 'board') && <div data-part="rail" role="list" aria-label="Participants">{people.value.map(p => <Tile key={p.id} p={p} video={v} role="listitem" />)}</div>}
        <div ref={(n: any) => (pipEl = n)} data-scope="pip" role="group" aria-roledescription="draggable self view" aria-label="Self view. Arrow keys move it to a corner." tabindex="0">
          <Tile p={me.value} self video={v} />
        </div>
      </div>
      <aside ref={(n: any) => (box = n)} data-part="sidebar" hidden={!side.value} aria-label={side.value === 'chat' ? 'Chat' : 'People'} onKeyDown={sideKey}>
        <div data-part="app-bar">
          <b>{side.value === 'chat' ? 'Chat' : `People · ${people.value.length + 1}`}</b>
          <span data-part="spacer"></span>
          {phone.value && chatSlot && <Button emphasis="ghost" tone="neutral" size="sm" onClick={() => side.set(side.value === 'chat' ? 'people' : 'chat')}>{side.value === 'chat' ? 'People' : 'Chat'}</Button>}
          <Button emphasis="ghost" tone="neutral" size="sm" data-icon-only="" aria-label="Close panel" onClick={closeSide}><G name="x" /></Button>
        </div>
        {side.value === 'chat'
          ? (chatSlot ? chatSlot() : <div></div>)
          : (
            <ul data-part="people">
              <Person p={me.value} sub="You" />
              {people.value.map(p => <Person key={p.id} p={p} sub={p.role || (p.handRaised ? 'Hand raised' : p.network === 'poor' ? 'Poor connection' : 'Participant')} />)}
            </ul>
          )}
        {side.value !== 'chat' && inviteSlot ? <div>{inviteSlot()}</div> : <div hidden></div>}
      </aside>
      <ControlBar mic={micOn.value} camera={camOn.value} sharing={sharingOn.value} hand={handUp.value} side={side.value} compact={phone.value} onToggle={toggle} onLeave={() => onLeave?.()} />
    </div>
  )
}

function Person({ p, sub }: { p: Participant; sub: string }) {
  return (
    <li>
      <Avatar name={p.name} size="sm" style={avatarTint(p.id)} />
      <span>{p.name}<small>{sub}</small></span>
      {p.handRaised && <span title="Hand raised"><G name="hand" /></span>}
      {p.isMuted ? <G name="micoff" /> : <G name="mic" />}
    </li>
  )
}
