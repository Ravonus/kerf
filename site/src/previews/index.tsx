// Previews for the warp components the test fixtures only reach through a parent, written in the same small form. Each
// shows the component alone, so its toolkit page has one preview of its own.
import { state } from '@weft-js/core'
import { InviteDialog, Conversation, PeerMark, PeerSelection, ShareDialog, AgendaDay, BranchSwitcher, Cite, Code, CodeBlock, ControlBar, EventEditor, EventPopover, Field, LineItem, LockIndicator, ModelPicker, MoveSheet, OrderTracker, PasskeyButton, PasswordMeter, Prose, Snippet, Sources, SsoButtons, TagsInput, Tile, UserMessage, Button } from '@weft-js/warp'
import type { CalEvent } from '@weft-js/warp-core'

const day = '2026-11-03'
const standup: CalEvent = { id: 'a', title: 'Weekly standup', start: `${day}T09:30`, end: `${day}T10:00` }
const review: CalEvent = { id: 'b', title: 'Design review', start: `${day}T13:00`, end: `${day}T14:00`, cal: 2 }
const ada = { id: 'ada', name: 'Ada Lovelace' }

export const AgendaDayCase = () => <AgendaDay events={[standup, review]} day={day} locale="en-GB" label="Tuesday" />
export function BranchSwitcherCase() {
  const at = state(1)
  return <BranchSwitcher index={at.value} count={3} onChange={i => (at.value = i)} />
}
export const CiteCase = () => <p>Weekly events keep their local time<Cite n={1} href="#source-1" />.</p>
export const CodeCase = () => <p>Read a box with <Code>count.value</Code>.</p>
export const CodeBlockCase = () => <CodeBlock language="tsx" filename="Counter.tsx" code={'const count = state(0)\n\nreturn <button onClick={() => count.value++}>{count.value}</button>'} />
export function ControlBarCase() {
  const mic = state(true)
  const camera = state(false)
  return <ControlBar mic={mic.value} camera={camera.value} onToggle={c => { if (c === 'mic') mic.value = !mic.value; if (c === 'camera') camera.value = !camera.value }} />
}
export function EventEditorCase() {
  const open = state(false)
  return <><Button onClick={() => (open.value = true)}>Edit event</Button><EventEditor open={open} event={standup} onSave={() => (open.value = false)} /></>
}
export function EventPopoverCase() {
  const open = state(false)
  let at!: HTMLElement
  return <><Button ref={(el: HTMLElement) => (at = el)} onClick={() => (open.value = true)}>Weekly standup</Button><EventPopover event={standup} open={open} anchor={() => at} /></>
}
export const FieldCase = () => <Field label="Width" hint="In pixels" suffix="px" control={p => <input id={p.id} aria-describedby={p.describedby} inputmode="numeric" data-part="input" {...p.rest} />} />
export function LineItemCase() {
  const cart = state([{ id: 'p', name: 'Linen shirt', variant: 'Large', price: 48, quantity: 1 }])
  return <LineItem line={cart.value[0]} cart={cart} />
}
export const LockIndicatorCase = () => <LockIndicator peer={ada} />
export function ModelPickerCase() {
  const model = state('md')
  return <ModelPicker value={model.value} onChange={m => (model.value = m)} models={[{ id: 'sm', label: 'Small' }, { id: 'md', label: 'Medium' }, { id: 'lg', label: 'Large' }] as any} />
}
export function MoveSheetCase() {
  const open = state(false)
  return <><Button onClick={() => (open.value = true)}>Move event</Button><MoveSheet open={open} event={review} events={[standup, review]} onMove={() => (open.value = false)} /></>
}
export const OrderTrackerCase = () => <OrderTracker />
export const PasskeyButtonCase = () => <PasskeyButton />
export function PasswordMeterCase() {
  return <PasswordMeter value="correct horse" />
}
export const ProseCase = () => <Prose text={'Events keep their **local** time.\n\n- Weekly\n- Monthly'} />
export const SnippetCase = () => <Snippet prompt="$" code="weft check --json" />
export const SourcesCase = () => <Sources base="s" items={[{ title: 'rrule.ts', path: 'src/calendar/rrule.ts' }, { title: 'Time zones', url: 'https://example.com/zones' }]} />
export const SsoButtonsCase = () => <SsoButtons providers={[{ id: 'github', label: 'GitHub', path: 'M4 12h16' }, { id: 'google', label: 'Google', path: 'M12 4v16' }] as any} />
export function TagsInputCase() {
  const tags = state(['design', 'weft'])
  return <TagsInput label="Tags" value={tags} />
}
export const TileCase = () => <Tile p={{ id: 'ada', name: 'Ada Lovelace' } as any} />
export const UserMessageCase = () => <UserMessage text="Move the standup to 10:00." />
export const ConversationCase = () => <Conversation title="Weekly standup">Move it to 10:00.</Conversation>
export const PeerMarkCase = () => <PeerMark peer={ada} />
export const PeerSelectionCase = () => <PeerSelection peer={ada} />
export function ShareDialogCase() {
  const open = state(false)
  const members = state<any[]>([{ ...ada, email: 'ada@example.com', role: 'owner' }])
  const link = state<any>({ access: 'restricted', role: 'viewer' })
  return <><Button onClick={() => (open.value = true)}>Share</Button><ShareDialog open={open} title="Q4 brief" members={members} link={link} url="https://example.com/d/q4" onInvite={() => {}} onRoleChange={() => {}} onLinkAccess={() => {}} /></>
}
export function InviteDialogCase() {
  const open = state(false)
  return <><Button onClick={() => (open.value = true)}>Invite people</Button><InviteDialog open={open} roles={[{ value: 'member', label: 'Member' }, { value: 'viewer', label: 'Viewer' }]} seatsLeft={3} onSend={() => {}} /></>
}
