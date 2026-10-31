import { derived, state, untrack, watch } from 'weft'
import { Text } from 'weft/text'
import { Button } from './Button'
import { Icon } from './Icon'
import { VirtualList, type VirtualControl } from './VirtualList'
import './styles'
import '@weft/ui-core/styles/app/thread.css'
import '@weft/ui-core/styles/app/message.css'
import '@weft/ui-core/styles/app/typing.css'
import '@weft/ui-core/styles/app/composer.css'
import '@weft/ui-core/styles/app/avatar.css'

export interface ThreadMessage {
  id: string
  author: string
  /** Two letters for the avatar. Default: the author's first two. */
  initials?: string
  text: string
  /** Shown beside the author. */
  time?: string
  /** Epoch ms: messages within 5 minutes from one author group. */
  at?: number
  /** A day divider goes above the first message of each `day`. */
  day?: string
  state?: 'sending' | 'sent' | 'read' | 'failed'
  /** The text is still arriving: rendered with `<Text stream>`. */
  streaming?: boolean
}

export interface ThreadProps {
  messages: readonly ThreadMessage[]
  /** Your `author`. */
  me?: string
  label: string
  /** What the header says under the name. */
  subtitle?: string
  /** A log height, if the parent doesn't size the thread. */
  height?: string
  /** The first unread message: the divider sits above it and the thread opens there. */
  unread?: string
  typing?: string
  onSend?: (text: string) => void
  onRetry?: (message: ThreadMessage) => void
  /** Near the top: load older messages, and prepend them to `messages`. */
  onOlder?: () => void
  onDrift?: (index: number, predicted: number, actual: number) => void
  control?: (c: VirtualControl) => void
}

const GROUP_MS = 5 * 60 * 1000
const STICK = 48
const STATUS = { sending: 'Sending…', sent: 'Sent', read: 'Read', failed: 'Not sent.' } as const

/** A chat (07 §5). `role="log"`, but its live region is off: windowing adds rows on scroll, and those aren't news. */
export function Thread(props: ThreadProps) {
  const list = derived(() => props.messages)
  const prior = derived(() => new Map(list.value.map((m, i) => [m.id, list.value[i - 1]])))
  let control: VirtualControl | undefined
  let box: HTMLTextAreaElement | undefined
  const stuck = state(true), fresh = state(0), said = state('')
  const mine = (m: ThreadMessage) => m.author === props.me
  const continued = (m: ThreadMessage) => {
    const before = prior.value.get(m.id)
    return !!before && !mine(m) && before.author === m.author && before.day === m.day && (m.at ?? 0) - (before.at ?? 0) < GROUP_MS
  }
  const dayOf = (m: ThreadMessage) => { const before = prior.value.get(m.id); return m.day && m.day !== before?.day ? m.day : undefined }
  const shape = (m: ThreadMessage) => `${mine(m) ? 'm' : continued(m) ? 'c' : 'h'}${dayOf(m) ? 'd' : ''}${props.unread === m.id ? 'u' : ''}${m.state ?? ''}`
  const body = (m: () => ThreadMessage) => (
    <div data-scope="message" role="none" data-mine={mine(m()) ? '' : undefined} data-continued={continued(m()) ? '' : undefined} data-state={m().state}>
      {!mine(m()) && <span data-scope="avatar" data-size="md" aria-hidden="true">{m().initials ?? m().author.slice(0, 2)}</span>}
      <div data-part="body">
        {!mine(m()) && !continued(m()) && <div data-part="by"><b>{m().author}</b><time>{m().time}</time></div>}
        <div data-part="bubble">
          {m().streaming
            ? <Text stream as="div">{m().text}</Text>
            : <span data-part="text" data-measure="" style="white-space:pre-wrap;text-wrap:wrap;text-rendering:auto">{m().text}</span>}
        </div>
        {mine(m()) && m().state && (
          <span data-part="status">
            {m().state === 'failed' && <Icon name="alert" />}
            {STATUS[m().state!]} {m().state !== 'failed' && m().time}
            {m().state === 'failed' && <Button emphasis="link" tone="critical" onClick={() => props.onRetry?.(m())}>Retry</Button>}
          </span>
        )}
      </div>
    </div>
  )

  const row = (m: () => ThreadMessage) => (
    <>
      {dayOf(m()) && <div data-part="divider">{dayOf(m())}</div>}
      {props.unread === m().id && <div data-part="divider" data-unread="">New</div>}
      {body(m)}
    </>
  )

  const take = (c: VirtualControl) => {
    control = c
    props.control?.(c)
    const open = untrack(() => props.unread)
    if (open) queueMicrotask(() => c.scrollTo(open))
  }

  const send = () => {
    const text = box!.value.trim()
    if (!text) return
    props.onSend?.(text)
    box!.value = ''
    control?.scrollToEnd()
  }

  let seen = untrack(() => list.value.at(-1)?.id)
  watch(() => list.value, all => {
    const last = all.at(-1)
    if (!last || last.id === seen) return
    const at = all.findIndex(m => m.id === seen)
    seen = last.id
    if (at < 0) return
    const theirs = all.slice(at + 1).filter(m => !mine(m))
    if (!theirs.length) return
    if (!stuck.value) fresh.value += theirs.length
    said.value = theirs.length === 1 ? `New message from ${theirs[0].author}` : `${theirs.length} new messages`
  })

  return (
    <section data-scope="thread" data-part="root" aria-label={props.label} style={props.height ? `block-size:${props.height}` : undefined}>
      <div data-part="app-bar">
        <div style="display:grid;gap:2px;min-inline-size:0"><b>{props.label}</b>{props.subtitle && <span style="font-size:12px">{props.subtitle}</span>}</div>
      </div>
      <div style="position:relative;display:grid;min-block-size:0">
        <VirtualList
          part="log"
          role="log"
          rowRole="article"
          roving
          open
          label="Messages"
          items={props.messages}
          rowKey={m => m.id}
          text={m => (m.streaming ? null : m.text)}
          variant={shape}
          estimate={64}
          stick={STICK}
          from={untrack(() => (props.unread ? 'start' : 'end'))}
          onStart={props.onOlder}
          onStick={s => { stuck.value = s; if (s) fresh.value = 0 }}
          onDrift={props.onDrift}
          control={take}
        >{row}</VirtualList>
        {!stuck.value && <Button emphasis="solid" tone="neutral" style="position:absolute;inset-block-end:12px;justify-self:center" onClick={() => control?.scrollToEnd()}>Jump to latest{fresh.value ? ` (${fresh.value})` : ''}</Button>}
      </div>
      <div>
        <div data-scope="typing" aria-live="polite">{props.typing}</div>
        <span class="vh" role="status">{said.value}</span>
        {props.onSend && (
          <div data-scope="composer">
            <textarea ref={(n: any) => (box = n)} rows="1" aria-label={`Message ${props.label}`} placeholder={`Message ${props.label}`} onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}></textarea>
            <Button onClick={send}>Send</Button>
          </div>
        )}
      </div>
    </section>
  )
}
