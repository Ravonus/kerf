// Message formatting and log behaviour.
import type { Peer } from './collab-peer'
import { reducedMotion } from './motion'
import { installSweep } from './sweep'
import { announce } from './toast'

/** Where a sent message stands. */
export type Delivery = 'sending' | 'sent' | 'read' | 'failed'
/** The message a reply quotes. */
export interface MessageQuote {
  ref?: string
  text: string
  /** Kept for a source that isn't loaded. */ author?: string
  time?: string
  /** The source lives in another channel. */ channel?: string
  deleted?: boolean
}
/** One emoji's reactions on a message. */
export interface MessageReaction {
  emoji: string
  /** Spoken name: "Thumbs up". */ label?: string
  count: number
  mine?: boolean
  names?: string[] | undefined
}
/** A file or link on a message. */
export interface MessageAttachment {
  kind: string
  name: string
  meta?: string
}
/** One message in a thread. */
export interface ChatMessage {
  id: string
  author: Peer
  mine?: boolean | undefined
  text: string
  /** Display time, formatted by the app ("09:48"). */
  time: string
  /** Epoch ms, for grouping. */
  at?: number | undefined
  /** Day label, formatted by the app ("Today"): a new label draws a divider. */
  day?: string | undefined
  state?: Delivery | undefined
  readAt?: string | undefined
  quote?: MessageQuote | undefined
  attachment?: MessageAttachment | undefined
  reactions?: MessageReaction[] | undefined
  replies?: { count: number; last?: string; people?: Peer[] } | undefined
  /** Names mentioned in `text`, without the @. "you" marks the whole message. */
  mentions?: string[] | undefined
  /** The text is still arriving: rendered with `<Text stream>`. */
  streaming?: boolean | undefined
}

/** How close two messages from one person must be to group. */
export const GROUP_MS = 5 * 60 * 1000
/** How much of a message a quote keeps. */
export const QUOTE_MAX = 280
/** How near the bottom counts as reading live. */
export const STICK_PX = 48

/** One row of a laid-out thread. */
export type ThreadRow =
  | { kind: 'day'; id: string; label: string; unread: boolean }
  | { kind: 'unread'; id: string; label: string; unread: true }
  | { kind: 'message'; id: string; message: ChatMessage; continued: boolean; last: boolean }

/**
 * The log's rows from its messages: a divider per day, the unread divider before `unreadFrom` ("New · Today" when it
 * lands on a day boundary, so the two never stack), and `continued` for one author within 5 minutes.
 */
export function threadRows(
  messages: readonly ChatMessage[],
  unreadFrom?: string | null,
): ThreadRow[] {
  const rows: ThreadRow[] = []
  const lastMine = messages.findLast((m) => m.mine)?.id
  let prev: ChatMessage | undefined
  let day: string | undefined
  for (const m of messages) {
    const newDay = m.day !== undefined && m.day !== day
    const unread = m.id === unreadFrom
    if (newDay)
      rows.push({
        kind: 'day',
        id: `day:${m.day}`,
        label: `${unread ? 'New · ' : ''}${m.day}`,
        unread,
      })
    else if (unread) rows.push({ kind: 'unread', id: `unread:${m.id}`, label: 'New', unread: true })
    if (m.day !== undefined) day = m.day
    const near =
      prev?.at !== undefined && m.at !== undefined ? m.at - prev.at < GROUP_MS : prev !== undefined
    const continued =
      !!prev &&
      !newDay &&
      !unread &&
      !m.mine &&
      !m.quote &&
      prev.author.id === m.author.id &&
      !prev.mine &&
      near
    rows.push({ kind: 'message', id: m.id, message: m, continued, last: m.id === lastMine })
    prev = m
  }
  return rows
}

/** Quote text: whitespace collapsed, trimmed, at most 280 characters with an ellipsis (07 §5.5). */
export function excerpt(text: string, max = QUOTE_MAX) {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** What a quote of `m` carries: the selection, or the whole message; an attachment quotes as its file name. */
export const quoteText = (m: Pick<ChatMessage, 'text' | 'attachment'>, selection?: string) =>
  excerpt(
    selection?.trim()
      ? selection
      : m.text
        ? `${m.text}${m.attachment ? ` (${m.attachment.name})` : ''}`
        : (m.attachment?.name ?? ''),
  )

/** A stretch of message text, marked if it's a mention. */
export type TextPart = { mention: boolean; text: string; at: number }

/** Split a message into text and @mention runs. Only names in `names` count. */
export function textParts(text: string, names: readonly string[] = []): TextPart[] {
  if (!names.length) return [{ mention: false, text, at: 0 }]
  const by = [...names]
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const parts: TextPart[] = []
  let from = 0
  for (const m of text.matchAll(new RegExp(`(^|\\s)(@(?:${by}))(?=$|[\\s.,!?:;])`, 'g'))) {
    const at = m.index + m[1]!.length
    if (at > from) parts.push({ mention: false, text: text.slice(from, at), at: from })
    parts.push({ mention: true, text: m[2]!, at })
    from = at + m[2]!.length
  }
  if (from < text.length) parts.push({ mention: false, text: text.slice(from), at: from })
  return parts
}

/** The @word the caret sits at the end of, or null. */
export function mentionQuery(value: string, caret: number) {
  const m = /(^|\s)@([\p{L}\p{N}_-]*)$/u.exec(value.slice(0, caret))
  return m ? { start: m.index + m[1]!.length, query: m[2]! } : null
}

/** Replace the @word at the caret with `@name `; the new value and caret. */
export function insertMention(value: string, caret: number, name: string) {
  const q = mentionQuery(value, caret)
  const start = q ? q.start : caret
  const head = `${value.slice(0, start)}@${name} `
  return { value: head + value.slice(caret), caret: head.length }
}

/** "Thumbs up, 3: you, Ana, Kofi" (07 §5.2). */
export function reactionName(r: MessageReaction) {
  const names = r.names?.length ? r.names : r.mine ? ['you'] : []
  return `${r.label ?? r.emoji}, ${r.count}${names.length ? `: ${names.join(', ')}` : ''}`
}

/** Options for the message log's keyboard, selection and read tracking. */
export interface MessageLogOptions {
  /** Q or the Quote button; `selection` is the text picked inside that message. */
  onQuote(id: string, selection: string): void
  /** Every message in the log, rendered or not. */
  ids(): readonly string[]
  /** Render a message wherever it is, and focus it. */
  reveal(id: string): void
}

function messageHandlers(
  doc: Document,
  h: {
    options: () => MessageLogOptions
    all: () => HTMLElement[]
    owner: (t: EventTarget | null) => HTMLElement | null
    rove: (m: HTMLElement | null | undefined) => void
    byId: (id: string) => HTMLElement | undefined
    quote: (m: HTMLElement) => void
    confirm: (m: Element) => void
    jump: (id: string) => void
    setPicked: (s: string) => void
  },
) {
  const { options, all, owner, rove, byId, quote, confirm, jump, setPicked } = h
  const onKey = (e: KeyboardEvent) => {
    const m = e.target as HTMLElement
    if (m.dataset.scope !== 'message') return
    const ids = options().ids(),
      i = ids.indexOf(m.dataset.mid!)
    const to = (
      { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: ids.length - 1 } as Record<string, number>
    )[e.key]
    if (to !== undefined && ids[to] !== undefined) {
      e.preventDefault()
      const next = byId(ids[to])
      if (next) next.focus()
      else options().reveal(ids[to])
    } else if (e.key.toLowerCase() === 'q' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      quote(m)
    }
  }
  const onFocus = (e: FocusEvent) => {
    const m = owner(e.target)
    if (m) rove(m)
  }
  const onDown = (e: PointerEvent) => {
    if (!(e.target as Element).closest?.('[data-quote]')) return
    const s = doc.getSelection()
    setPicked(s && !s.isCollapsed ? s.toString() : '')
  }
  const onUp = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || (e.target as Element).closest?.('button, a')) return
    const m = owner(e.target)
    for (const x of all()) if (x !== m) x.removeAttribute('data-actions')
    m?.toggleAttribute('data-actions')
  }
  const onClick = (e: MouseEvent) => {
    const t = e.target as Element
    const m = owner(t)
    if (t.closest?.('[data-quote]') && m) return quote(m)
    if (t.closest?.('[data-copytext]') && m) {
      void navigator.clipboard
        ?.writeText(m.querySelector('[data-part="text"]')?.textContent ?? '')
        .catch(() => {})
      confirm(m)
      return announce(doc, 'Message copied')
    }
    const j = t.closest?.<HTMLElement>('[data-jump]')
    if (j) jump(j.dataset.jump!)
  }
  return { onKey, onFocus, onDown, onUp, onClick }
}

function messageRove(all: () => HTMLElement[], doc: Document) {
  const stop = (el: HTMLElement, on: boolean) => {
    const to = on ? 0 : -1
    if (el.tabIndex !== to) el.tabIndex = to
  }
  const rove = (m: HTMLElement | null | undefined) => {
    for (const x of all()) {
      stop(x, x === m)
      const open = x === m && x.contains(doc.activeElement) // only a focused message's toolbar is in the tab order
      for (const b of x.querySelectorAll<HTMLElement>('[data-part="actions"] button')) stop(b, open)
    }
  }
  return rove
}

/**
 * The log's behaviour (07 §5.2, §5.5), over a window of rows: the window owns scrolling and sticking to the bottom, so
 * this is what a message does. Messages are one roving stop (↑/↓, Home/End), the focused one's toolbar joins the tab
 * order, Q quotes it. A tap shows a message's toolbar on touch. Delegates Quote, Copy text and Jump to original. New
 * nodes are watched, so a rendered row is enough.
 */
export function messageLog(log: HTMLElement, opts: MessageLogOptions) {
  let o = opts
  let picked = ''
  const doc = log.ownerDocument
  const all = () =>
    [...log.querySelectorAll<HTMLElement>('[data-scope="message"]')].filter(
      (m) => !m.closest('[data-probe]'),
    )
  const owner = (t: EventTarget | null) =>
    (t as Element).closest?.<HTMLElement>('[data-scope="message"]')
  const rove = messageRove(all, doc)
  const confirm = (m: Element) => installSweep(doc).confirm(m.querySelector('[data-part="bubble"]'))
  const quote = (m: HTMLElement) => {
    const text = m.querySelector('[data-part="text"]')
    const sel = doc.getSelection()
    const live = sel && !sel.isCollapsed && text?.contains(sel.anchorNode) ? sel.toString() : ''
    const selection = picked || live
    picked = ''
    o.onQuote(m.dataset.mid!, selection)
  }
  const land = (m: HTMLElement) => {
    m.scrollIntoView?.({ block: 'center', behavior: reducedMotion(m) ? 'auto' : 'smooth' })
    m.focus({ preventScroll: true })
    confirm(m)
    announce(doc, `Original message from ${m.getAttribute('aria-label')}`)
  }
  const byId = (id: string) => all().find((x) => x.dataset.mid === id)
  const jump = (id: string) => {
    if (!o.ids().includes(id)) return announce(doc, 'Original message deleted')
    const m = byId(id)
    if (m) return land(m)
    o.reveal(id) // out of the window: it renders, then lands
    requestAnimationFrame(() => {
      const now = byId(id)
      if (now) land(now)
    })
  }
  const { onKey, onFocus, onDown, onUp, onClick } = messageHandlers(doc, {
    options: () => o,
    all,
    owner,
    rove,
    byId,
    quote,
    confirm,
    jump,
    setPicked: (s) => {
      picked = s
    },
  })
  const watch = new doc.defaultView!.MutationObserver((records: MutationRecord[]) => {
    if (!records.some((r) => [...r.addedNodes, ...r.removedNodes].some((n) => n.nodeType === 1)))
      return
    const focused = log.contains(doc.activeElement) ? owner(doc.activeElement) : null
    rove(focused ?? all().at(-1))
  })
  rove(all().at(-1))
  log.addEventListener('keydown', onKey)
  log.addEventListener('focusin', onFocus)
  log.addEventListener('pointerdown', onDown)
  log.addEventListener('pointerup', onUp)
  log.addEventListener('click', onClick)
  watch.observe(log, { childList: true, subtree: true })
  return {
    update(next: MessageLogOptions) {
      o = next
    },
    destroy() {
      watch.disconnect()
      log.removeEventListener('keydown', onKey)
      log.removeEventListener('focusin', onFocus)
      log.removeEventListener('pointerdown', onDown)
      log.removeEventListener('pointerup', onUp)
      log.removeEventListener('click', onClick)
    },
  }
}
