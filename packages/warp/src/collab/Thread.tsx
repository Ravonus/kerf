import {
  announce,
  arrivalTracker,
  burst,
  firstName,
  joinNames,
  messageLog,
  quoteText,
  STICK_PX,
  threadRows,
  typingLine,
  uid,
  type ChatMessage,
  type MessageReaction,
} from '@weft-js/warp-core'
import {
  derived,
  onCleanup,
  onMount,
  state,
  untrack,
  watch,
  type Derived,
  type State,
} from '@weft-js/core'
import { Button } from '../Button'
import { use } from '@weft-js/warp-core/weft'
import { VirtualList, type VirtualControl } from '../VirtualList'
import {
  Composer,
  TypingIndicator,
  type ComposerProps,
  type ComposerSend,
  type QuoteDraftValue,
} from './Composer'
import { read, type Live } from './peer'
import { Message } from './Thread/Message'
import { entries, plain, shape, Divider, type Entry } from './Thread/rows'
import '../styles'
import '@weft-js/warp-core/styles/components/button.css'
import '@weft-js/warp-core/styles/app/tokens.css'
import '@weft-js/warp-core/styles/app/base.css'
import '@weft-js/warp-core/styles/app/thread.css'
import '@weft-js/warp-core/styles/app/message.css'
import '@weft-js/warp-core/styles/app/reactions.css'
import '@weft-js/warp-core/styles/app/thread-replies.css'
import '@weft-js/warp-core/styles/app/avatar-stack.css'

/** Props for Message. */
export interface MessageProps {
  message: ChatMessage
  continued?: boolean
  /** The last of mine: only it carries Sent or Read. */
  last?: boolean
  arrive?: boolean
  /** The quoted source, read live. */
  source?: ChatMessage | undefined
  onRetry?: ((m: ChatMessage) => void) | undefined
  onReact?: (m: ChatMessage, r: MessageReaction | null) => void
  onReplies?: (m: ChatMessage) => void
}

export { Message } from './Thread/Message'

/** Props for Thread. */
export interface ThreadProps {
  /** Names the region: "calendar-engine channel". */
  label: string
  messages: Live<ChatMessage[]>
  /** The first unread message: opening lands on the divider before it. */
  unreadFrom?: string | null
  /** Names typing now. */
  typing?: Live<string[]>
  /** The header's content (`data-part="app-bar"`): channel, members, stack, call, search. */
  header?: unknown
  /** A log height, if the parent doesn't size the thread. */
  height?: string
  /** No `onSend`, no composer: a read-only log. */
  onSend?: ((m: ComposerSend) => void) | undefined
  onRetry?: ((m: ChatMessage) => void) | undefined
  onReact?: (m: ChatMessage, r: MessageReaction | null) => void
  onReplies?: (m: ChatMessage) => void
  /** Near the top: load older messages, and prepend them to `messages`. */
  onOlder?: () => void
  onDrift?: ((index: number, predicted: number, actual: number) => void) | undefined
  control?: ((c: VirtualControl) => void) | undefined
  composer?: Omit<ComposerProps, 'onSend' | 'quote' | 'input'>
}

/**
 * A conversation (07 §5, §5.5): the log, a window of rows, so 100,000 messages cost what 20 do (role=log; day and unread
 * dividers, grouping, stick to bottom, Jump to latest with the new count, roving messages and Q), typing line, composer
 * with the quote draft. New messages are announced as one summary after 1 s of quiet, a failed send assertively once.
 * Plain messages have exact heights from `text.measure`; rows are keyed, so live updates patch in place.
 */
function observeThread({
  list,
  ids,
  stuck,
  unseen,
  doc,
  getWin,
}: {
  list: Derived<ChatMessage[]>
  ids: Derived<string[]>
  stuck: State<boolean>
  unseen: State<number>
  doc: () => Document
  getWin: () => VirtualControl | undefined
}) {
  onMount(() => {
    const told = burst<string>((names) => {
      const who = [...new Set(names)]
      announce(
        doc(),
        names.length === 1
          ? `New message from ${who[0]}`
          : who.length === 1
            ? `${names.length} new messages from ${who[0]}`
            : `${names.length} new messages from ${joinNames(who)}`,
      )
    })
    const failed = new Set(
      untrack(() => list.value.filter((m) => m.state === 'failed').map((m) => m.id)),
    )
    let seen = new Set(untrack(() => ids.value))
    onCleanup(told.cancel)
    watch(
      () => list.value,
      (l) => {
        for (const m of l) {
          if (!seen.has(m.id) && !m.mine) told.push(firstName(m.author.name))
          if (m.state === 'failed' && !failed.has(m.id)) {
            failed.add(m.id)
            announce(doc(), 'Message not sent', true)
          }
          if (m.state !== 'failed') failed.delete(m.id)
        }
        const last = l.at(-1)
        if (last && !seen.has(last.id)) {
          // a prepend of older messages isn't an arrival
          const known = l.findIndex((m) => seen.has(m.id))
          const arrived = l.slice(l.findLastIndex((m) => seen.has(m.id)) + 1)
          if (arrived.some((m) => m.mine)) queueMicrotask(() => getWin()?.scrollToEnd())
          else if (known >= 0 && !stuck.value) unseen.value += arrived.length
        }
        seen = new Set(l.map((m) => m.id))
      },
    )
  })
}

function bindThread({
  getRoot,
  find,
  draft,
  getBox,
  getWin,
  ids,
  doc,
}: {
  getRoot: () => HTMLElement | undefined
  find: (mid?: string) => ChatMessage | undefined
  draft: State<QuoteDraftValue | null>
  getBox: () => HTMLTextAreaElement | undefined
  getWin: () => VirtualControl | undefined
  ids: Derived<string[]>
  doc: () => Document
}) {
  use(
    messageLog,
    () => getRoot()?.querySelector<HTMLElement>('[data-part="log"]') ?? undefined,
    () => ({
      onQuote(mid: string, selection: string) {
        const m = find(mid)
        if (!m) return
        const author = m.mine ? 'You' : m.author.name
        draft.value = { ref: m.id, author, time: m.time, text: quoteText(m, selection) }
        getBox()?.focus()
        announce(doc(), `Quoting ${author}. Escape removes the quote.`)
      },
      ids: () => untrack(() => ids.value),
      reveal: (mid: string) => getWin()?.focus(mid),
    }),
  )
}

function threadState(p: ThreadProps) {
  const id = uid('thread')
  const list = derived(() => read(p.messages))
  const rows = derived(() => entries(threadRows(list.value, p.unreadFrom)))
  const ids = derived(() => list.value.map((m) => m.id))
  const mark = arrivalTracker()
  const fresh = derived(() => mark(ids.value))
  const stuck = state(true)
  const unseen = state(0)
  const draft = state<QuoteDraftValue | null>(null)
  const typingNames = derived(() => read(p.typing) ?? [])
  const head = derived(() => p.header)
  let root: HTMLElement | undefined
  let box: HTMLTextAreaElement | undefined
  let win: VirtualControl | undefined
  const doc = () => root!.ownerDocument
  const find = (mid?: string) => (mid ? list.value.find((m) => m.id === mid) : undefined)

  observeThread({ list, ids, stuck, unseen, doc, getWin: () => win })
  bindThread({ getRoot: () => root, find, draft, getBox: () => box, getWin: () => win, ids, doc })
  const latest = () => {
    win?.scrollToEnd()
    const last = ids.value.at(-1)
    if (last !== undefined) win?.focus(last)
  }
  const take = (c: VirtualControl) => {
    win = c
    p.control?.(c)
    const open = untrack(() => p.unreadFrom)
    if (open) queueMicrotask(() => c.scrollTo(open))
  }

  return {
    id,
    rows,
    stuck,
    unseen,
    draft,
    typingNames,
    head,
    latest,
    take,
    find,
    fresh,
    setRoot: (n: HTMLElement) => {
      root = n
    },
    setBox: (n: HTMLTextAreaElement) => {
      box = n
    },
  }
}

function threadView(p: ThreadProps, ctx: ReturnType<typeof threadState>) {
  const row = (e: () => Entry) => {
    const source = derived(() => ctx.find(e().row.message.quote?.ref))
    return (
      <>
        {e().divider && <Divider d={e().divider!} />}
        <Message
          message={e().row.message}
          continued={e().row.continued}
          last={e().row.last}
          arrive={ctx.fresh.value.includes(e().id)}
          source={source.value}
          onRetry={(m) => p.onRetry?.(m)}
          onReact={(m, r) => p.onReact?.(m, r)}
          onReplies={(m) => p.onReplies?.(m)}
        />
      </>
    )
  }
  const from = untrack(() => (p.unreadFrom ? 'start' : 'end'))
  return (
    <section
      ref={(n) => ctx.setRoot(n)}
      data-scope="thread"
      data-part="root"
      aria-label={p.label}
      id={ctx.id}
      style={p.height ? `block-size:${p.height}` : undefined}
    >
      {ctx.head.value !== undefined ? (
        <div data-part="app-bar">{ctx.head.value}</div>
      ) : (
        <span></span>
      )}
      <VirtualList
        part="log"
        role="log"
        bareRows
        open
        tabindex={-1}
        label="Messages"
        items={ctx.rows.value}
        rowKey={(e) => e.id}
        text={(e) => (plain(e.row.message) ? e.row.message.text : null)}
        variant={shape}
        estimate={64}
        gap={2}
        stick={STICK_PX}
        from={from}
        onStart={p.onOlder}
        onStick={(s) => {
          ctx.stuck.value = s
          if (s) ctx.unseen.value = 0
        }}
        onDrift={p.onDrift}
        control={ctx.take}
      >
        {row}
      </VirtualList>
      {!ctx.stuck.value && (
        <Button size="sm" data-part="jump" onClick={ctx.latest}>
          Jump to latest{ctx.unseen.value > 0 ? ` · ${ctx.unseen.value} new` : ''}
        </Button>
      )}
      <div>
        <TypingIndicator text={typingLine(ctx.typingNames.value)} />
        {p.onSend && (
          <Composer
            {...(p.composer ?? { label: `Message ${p.label}` })}
            quote={ctx.draft}
            onSend={(m) => p.onSend!(m)}
            input={(el) => ctx.setBox(el)}
          />
        )}
      </div>
    </section>
  )
}

export function Thread(props: ThreadProps) {
  const p = untrack(() => props)
  return threadView(p, threadState(p))
}
