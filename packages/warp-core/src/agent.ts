// The warp-core half of the agent pack (07 §1): pure logic and actions, no framework. `foldAnswer` is the one path from
// an event stream to what the UI draws, so replay, reconnect and SSR hydration all render the same value.
import { nextIndex } from './focus'
import { place, pushLayer } from './layers'
import { announce } from './toast'
import { installSweep } from './sweep'

export type ToolState = 'running' | 'done' | 'failed' | 'approval' | 'denied'
export type TaskState = 'pending' | 'running' | 'done' | 'blocked'
export type AnswerState = 'waiting' | 'streaming' | 'approval' | 'done' | 'stopped' | 'error'

export interface AgentSource { id?: string | undefined; title: string; path?: string; snippet?: string; url?: string }
export interface AgentTool { id: string; name: string; args: string; state: ToolState; output?: string | undefined; ms?: number | undefined; exit?: number | undefined; startedAt?: number | undefined }
export interface AgentQuestion { id: string; prompt: string; options: string[]; multiple?: boolean | undefined; free?: boolean | undefined; answer?: string | string[] | undefined; closed?: boolean }
export interface PlanStep { id: string; title: string; state: TaskState; note?: string | undefined }
export type AnswerBlock =
  | { kind: 'reasoning'; id: string; text: string; streaming: boolean; seconds?: number | undefined; startedAt?: number | undefined }
  | { kind: 'text'; id: string; text: string }
  | { kind: 'tool'; id: string }
  | { kind: 'question'; id: string; question: AgentQuestion }
export interface Answer { state: AnswerState; blocks: AnswerBlock[]; tools: AgentTool[]; sources: AgentSource[]; plan: PlanStep[]; error?: string }

/** 07 §1.7. `at` is a timestamp in ms, kept in the event so a replay computes the same durations. */
export type AgentEvent =
  | { kind: 'reasoning'; text: string; at?: number }
  | { kind: 'text'; text: string; at?: number }
  /** A tool starts; the same id again (after an approval) runs it. */
  | { kind: 'tool'; id: string; name?: string; args?: string; at?: number }
  | { kind: 'tool-result'; id: string; output?: string | undefined; exit?: number | undefined; failed?: boolean; denied?: boolean; ms?: number | undefined; at?: number }
  | { kind: 'approval'; id: string; name?: string; args?: string; at?: number }
  /** A question asked; the same id with `answer` closes it. */
  | { kind: 'question'; id: string; prompt?: string; options?: string[]; multiple?: boolean | undefined; free?: boolean | undefined; answer?: string | string[] | undefined; at?: number }
  | ({ kind: 'source'; at?: number } & AgentSource)
  /** The whole plan (`steps`), or one step's change (`id`, `state`, `note`). */
  | { kind: 'plan'; steps?: PlanStep[]; id?: string | undefined; state?: TaskState; note?: string | undefined; at?: number }
  | { kind: 'done'; stopped?: boolean; at?: number }
  | { kind: 'error'; message: string; at?: number }

export const emptyAnswer = (): Answer => ({ state: 'waiting', blocks: [], tools: [], sources: [], plan: [] })

const seal = (b: AnswerBlock, at?: number): AnswerBlock => {
  if (b.kind !== 'reasoning' || !b.streaming) return b
  const seconds = b.seconds ?? (at !== undefined && b.startedAt !== undefined ? Math.max(1, Math.round((at - b.startedAt) / 1000)) : undefined)
  return { ...b, streaming: false, seconds }
}
const sealAll = (blocks: AnswerBlock[], at?: number) => blocks.map(b => seal(b, at))
const upsert = <T extends { id: string }>(list: T[], id: string, make: () => T, change: (x: T) => T) => {
  const at = list.findIndex(x => x.id === id)
  return at < 0 ? [...list, change(make())] : list.map((x, i) => (i === at ? change(x) : x))
}

function settle(a: Answer): AnswerState {
  if (a.state === 'done' || a.state === 'stopped' || a.state === 'error') return a.state
  if (a.tools.some(t => t.state === 'approval') || a.blocks.some(b => b.kind === 'question' && b.question.answer === undefined)) return 'approval'
  return a.blocks.length ? 'streaming' : 'waiting'
}

function step(a: Answer, e: AgentEvent): Answer {
  const n = { ...a }
  switch (e.kind) {
    case 'reasoning': {
      const last = a.blocks.at(-1)
      if (last?.kind === 'reasoning' && last.streaming) n.blocks = [...a.blocks.slice(0, -1), { ...last, text: last.text + e.text }]
      else n.blocks = [...a.blocks, { kind: 'reasoning', id: `b${a.blocks.length}`, text: e.text, streaming: true, startedAt: e.at }]
      break
    }
    case 'text': {
      const blocks = sealAll(a.blocks, e.at)
      const last = blocks.at(-1)
      n.blocks = last?.kind === 'text' ? [...blocks.slice(0, -1), { ...last, text: last.text + e.text }] : [...blocks, { kind: 'text', id: `b${blocks.length}`, text: e.text }]
      break
    }
    case 'tool':
    case 'approval': {
      const state: ToolState = e.kind === 'tool' ? 'running' : 'approval'
      const had = a.tools.some(t => t.id === e.id)
      n.tools = upsert(a.tools, e.id, () => ({ id: e.id, name: e.name ?? e.id, args: '', state, startedAt: e.at }), t => ({ ...t, name: e.name ?? t.name, args: e.args ?? t.args, state, startedAt: state === 'running' ? (e.at ?? t.startedAt) : t.startedAt }))
      n.blocks = sealAll(a.blocks, e.at)
      if (!had) n.blocks = [...n.blocks, { kind: 'tool', id: e.id }]
      break
    }
    case 'tool-result': {
      const state: ToolState = e.denied ? 'denied' : e.failed || (e.exit ?? 0) !== 0 ? 'failed' : 'done'
      n.tools = upsert(a.tools, e.id, () => ({ id: e.id, name: e.id, args: '', state }), t => ({ ...t, state, output: e.output ?? t.output, exit: e.exit, ms: e.ms ?? (e.at !== undefined && t.startedAt !== undefined ? e.at - t.startedAt : t.ms) }))
      break
    }
    case 'question': {
      const has = a.blocks.some(b => b.kind === 'question' && b.id === e.id)
      if (has) n.blocks = a.blocks.map(b => (b.kind === 'question' && b.id === e.id ? { ...b, question: { ...b.question, answer: e.answer ?? b.question.answer } } : b))
      else n.blocks = [...sealAll(a.blocks, e.at), { kind: 'question', id: e.id, question: { id: e.id, prompt: e.prompt ?? '', options: e.options ?? [], multiple: e.multiple, free: e.free, answer: e.answer } }]
      break
    }
    case 'source': {
      const { kind: _k, at: _a, ...src } = e
      if (!(src.id && a.sources.some(s => s.id === src.id))) n.sources = [...a.sources, src]
      break
    }
    case 'plan':
      if (e.steps) n.plan = e.steps
      else if (e.id) n.plan = a.plan.map(s => (s.id === e.id ? { ...s, state: e.state ?? s.state, note: e.note } : s))
      break
    case 'done':
      n.blocks = sealAll(a.blocks, e.at).map(b => (b.kind === 'question' && b.question.answer === undefined ? { ...b, question: { ...b.question, closed: true } } : b))
      n.state = e.stopped ? 'stopped' : 'done'
      n.tools = a.tools.map(t => (t.state === 'running' ? { ...t, state: 'failed', output: t.output ?? 'Stopped' } : t.state === 'approval' ? { ...t, state: 'denied' } : t))
      n.plan = a.plan.map(s => (s.state === 'done' ? s : { ...s, note: undefined, state: e.stopped ? 'pending' : s.state === 'running' ? 'done' : s.state }))
      break
    case 'error':
      n.blocks = sealAll(a.blocks, e.at)
      n.state = 'error'
      n.error = e.message
      n.tools = a.tools.map(t => (t.state === 'running' || t.state === 'approval' ? { ...t, state: 'failed' } : t))
      break
  }
  n.state = settle(n)
  return n
}

/**
 * Fold events into the Answer the UI renders (07 §1.7). `foldAnswer(events)` for a whole list, or
 * `foldAnswer(answer, event)` as the `fold` of a stream. Never mutates: unchanged items keep their identity.
 */
export function foldAnswer(events: AgentEvent[]): Answer
export function foldAnswer(answer: Answer | undefined, event: AgentEvent): Answer
export function foldAnswer(a: AgentEvent[] | Answer | undefined, e?: AgentEvent): Answer {
  return Array.isArray(a) ? a.reduce(step, emptyAnswer()) : step(a ?? emptyAnswer(), e!)
}

// ---- text: a minimal safe default until warp has a Markdown component ----------------------------------------------

export type TextBlock = { kind: 'p'; at: number; text: string } | { kind: 'ul'; at: number; items: { at: number; text: string }[] } | { kind: 'code'; at: number; lang: string; text: string; open: boolean }
export type Inline = { kind: 'text' | 'code'; at: number; text: string } | { kind: 'cite'; at: number; n: number }

/** Paragraphs, `- ` lists and code fences. A fence with no close yet is already a code block (07 §1.3). */
export function parseText(text: string): TextBlock[] {
  const out: TextBlock[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const fence = /^```(\S*)/.exec(line)
    if (fence) {
      const body: string[] = []
      let j = i + 1
      while (j < lines.length && !/^```\s*$/.test(lines[j]!)) body.push(lines[j++]!)
      out.push({ kind: 'code', at: i, lang: fence[1]!, text: body.join('\n'), open: j >= lines.length })
      i = j
    } else if (/^[-*] /.test(line)) {
      const last = out.at(-1)
      const item = { at: i, text: line.slice(2) }
      if (last?.kind === 'ul' && lines[i - 1] !== '') last.items.push(item)
      else out.push({ kind: 'ul', at: i, items: [item] })
    } else if (line.trim()) {
      const last = out.at(-1)
      if (last?.kind === 'p' && lines[i - 1]!.trim()) last.text += `\n${line}`
      else out.push({ kind: 'p', at: i, text: line })
    }
  }
  return out
}

/** Inline code and `[n]` cites; everything else stays text, so nothing in a model's output becomes markup. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  const re = /`([^`\n]+)`|\[(\d+)\]/g
  let from = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > from) out.push({ kind: 'text', at: from, text: text.slice(from, m.index) })
    out.push(m[1] !== undefined ? { kind: 'code', at: m.index, text: m[1] } : { kind: 'cite', at: m.index, n: Number(m[2]) })
    from = m.index + m[0].length
  }
  if (from < text.length) out.push({ kind: 'text', at: from, text: text.slice(from) })
  return out
}

/** All the answer's text, for Copy. */
export const answerText = (a: Answer) => a.blocks.flatMap(b => (b.kind === 'text' ? [b.text] : [])).join('\n\n')

// ---- small rules -----------------------------------------------------------------------------------------------------

export const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`
export const formatClock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
export const formatTokens = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

/** What a ToolCall says: the short status at its end, and the words only a screen reader gets before it. */
export function toolStatus(t: AgentTool) {
  const status = t.state === 'running' ? 'running' : t.state === 'approval' ? 'needs approval' : t.state === 'denied' ? 'denied'
    : t.state === 'failed' ? (t.exit !== undefined ? `exit ${t.exit}` : 'failed') : t.ms !== undefined ? formatSeconds(t.ms) : 'done'
  // said before the visible status: "run_tests, failed, exit 1"
  const word = t.state === 'done' && status !== 'done' ? ', done, ' : t.state === 'failed' && status !== 'failed' ? ', failed, ' : ', '
  return { status, word }
}

/** 07 §1.2: high at 80%, full at 95%. */
export const contextLevel = (ratio: number) => (ratio >= 0.95 ? 'full' : ratio >= 0.8 ? 'high' : undefined)

/** The changed lines between two argument texts, as "- " and "+ " lines; empty when they match (07 §1.3). */
export function argsDiff(before: string, after: string): string[] {
  if (before === after) return []
  const a = before.split('\n'), b = after.split('\n')
  const lcs = a.map(() => new Array<number>(b.length + 1).fill(0))
  lcs.push(new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
  const out: string[] = []
  let i = 0, j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++ }
    else if (j >= b.length || (i < a.length && lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) out.push(`- ${a[i++]}`)
    else out.push(`+ ${b[j++]}`)
  }
  return out
}

/** The open `/` or `@` token at the caret: `/` only at the start of the message, `@` at the start of a word. */
export function suggestQuery(text: string, caret: number) {
  const m = /(^|\s)([/@])([^\s/@]*)$/.exec(text.slice(0, caret))
  if (!m || (m[2] === '/' && m.index + m[1]!.length !== 0)) return null
  return { trigger: m[2] as '/' | '@', query: m[3]!.toLowerCase(), start: m.index + m[1]!.length }
}

/** Replace the token from `start` to the caret with `value` plus a space. */
export function applySuggest(text: string, start: number, caret: number, value: string) {
  const head = text.slice(0, start) + value + ' '
  return { text: head + text.slice(caret), caret: head.length }
}

// ---- trace ---------------------------------------------------------------------------------------------------------

export interface TraceSpan { id: string; name: string; start: number; ms: number; tokens?: number | undefined; cost?: number | undefined; children?: TraceSpan[] }
export interface TraceRow { id: string; name: string; ms: number; tokens?: number | undefined; cost?: number | undefined; level: number; pos: number; size: number; parent?: string | undefined; branch: boolean; open: boolean; x: number; w: number; color: number }

/** The visible rows of a span tree in order, on one time axis: x and w are fractions of the whole run. */
export function traceRows(spans: TraceSpan[], collapsed: ReadonlySet<string> = new Set()): TraceRow[] {
  let lo = Infinity, hi = -Infinity
  const scan = (s: TraceSpan) => { lo = Math.min(lo, s.start); hi = Math.max(hi, s.start + s.ms); s.children?.forEach(scan) }
  spans.forEach(scan)
  const span = hi - lo || 1
  const rows: TraceRow[] = []
  let order = 0
  const walk = (list: TraceSpan[], level: number, parent: string | undefined, show: boolean) => list.forEach((s, i) => {
    const color = (order++ % 8) + 1
    const branch = !!s.children?.length, open = branch && !collapsed.has(s.id)
    if (show) rows.push({ id: s.id, name: s.name, ms: s.ms, tokens: s.tokens, cost: s.cost, level, pos: i + 1, size: list.length, parent, branch, open, x: (s.start - lo) / span, w: s.ms / span, color })
    if (branch) walk(s.children!, level + 1, s.id, show && open)
  })
  walk(spans, 1, undefined, true)
  return rows
}

export const traceSummary = (r: Pick<TraceRow, 'ms' | 'tokens' | 'cost'>) =>
  [formatSeconds(r.ms), r.tokens !== undefined ? `${formatTokens(r.tokens)} tok` : undefined, r.cost !== undefined ? `$${r.cost.toFixed(3)}` : undefined].filter(Boolean).join(' · ')

/** APG treegrid keys over visible rows: which row to focus, or which branch to toggle. */
export function traceKey(key: string, rows: TraceRow[], at: number, rtl = false): { focus?: string | undefined; toggle?: string } | null {
  const row = rows[at]!
  const [open, close] = rtl ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft']
  if (key === 'Enter' || key === ' ') return row.branch ? { toggle: row.id } : {}
  if (key === open) return row.branch && !row.open ? { toggle: row.id } : row.branch ? { focus: rows[at + 1]?.id } : {}
  if (key === close) return row.branch && row.open ? { toggle: row.id } : row.parent ? { focus: row.parent } : {}
  const to = nextIndex(key, at, rows.length, { orientation: 'vertical' })
  return to < 0 ? null : { focus: rows[to]!.id }
}

// ---- actions ---------------------------------------------------------------------------------------------------------

export interface StickOptions { threshold?: number; onAway(away: boolean): void }

/**
 * Keep a scroller at its bottom while the user is within `threshold` px of it (48, 07 §1.3). Reports when they leave,
 * so a binding can show Jump to latest. New content never moves someone who has scrolled up.
 */
export function stick(el: HTMLElement, opts: StickOptions) {
  let o = opts
  let pinned = true
  const win = el.ownerDocument.defaultView as (Window & typeof globalThis)
  const near = () => el.scrollHeight - el.scrollTop - el.clientHeight <= (o.threshold ?? 48)
  const bottom = () => { el.scrollTop = el.scrollHeight }
  const grew = () => { if (pinned) bottom(); else o.onAway(!near()) }
  const onScroll = () => { pinned = near(); o.onAway(!pinned) }
  el.addEventListener('scroll', onScroll, { passive: true })
  const mo = new win.MutationObserver(grew)
  mo.observe(el, { subtree: true, childList: true, characterData: true })
  const ro = win.ResizeObserver ? new win.ResizeObserver(grew) : undefined
  ro?.observe(el)
  bottom()
  return {
    update(next: StickOptions) { o = next },
    destroy() { el.removeEventListener('scroll', onScroll); mo.disconnect(); ro?.disconnect() },
  }
}

export interface CiteOptions { panel: HTMLElement; onOpen(open: boolean): void }

/** The preview of a citation (07 §1.3): opens on hover and keyboard focus, stays while the pointer or focus is in it. */
export function citePreview(link: HTMLElement, opts: CiteOptions) {
  let o = opts
  let timer: ReturnType<typeof setTimeout> | undefined
  let remove: (() => void) | undefined
  const later = (fn: () => void, ms: number) => { clearTimeout(timer); timer = setTimeout(fn, ms) }
  const inside = (n: EventTarget | null) => n instanceof Node && (o.panel.contains(n) || link.contains(n))
  function hide() {
    clearTimeout(timer)
    if (!remove) return
    remove()
    remove = undefined
    if (o.panel.matches?.(':popover-open')) o.panel.hidePopover?.()
    o.onOpen(false)
  }
  const show = () => {
    clearTimeout(timer)
    if (remove) return
    o.panel.showPopover?.()
    place(o.panel, link, 'top', 'start', 6)
    remove = pushLayer({ el: o.panel, trigger: link, passive: true, close: hide })
    o.onOpen(true)
  }
  const leave = () => later(() => { if (!link.matches(':hover') && !o.panel.matches(':hover') && !o.panel.contains(link.ownerDocument.activeElement) && link.ownerDocument.activeElement !== link) hide() }, 120)
  const enter = (e: PointerEvent) => { if (e.pointerType !== 'touch') later(show, 250) }
  const focus = () => { if (link.matches(':focus-visible')) show() }
  const out = (e: FocusEvent) => { if (!inside(e.relatedTarget)) hide() }
  const on: [EventTarget, string, (e: any) => void][] = [[link, 'pointerenter', enter], [link, 'pointerleave', leave], [o.panel, 'pointerleave', leave], [link, 'focusin', focus], [link, 'focusout', out], [o.panel, 'focusout', out], [link, 'click', hide]]
  for (const [t, n, f] of on) t.addEventListener(n, f)
  return {
    update(next: CiteOptions) { o = next },
    destroy() { for (const [t, n, f] of on) t.removeEventListener(n, f); clearTimeout(timer); remove?.() },
  }
}

/** Where `field-sizing: content` is missing, grow a textarea by hand; its CSS max still caps it at 8 lines. */
export function autosize(el: HTMLTextAreaElement, _value?: string) {
  const css = el.ownerDocument.defaultView?.CSS
  const native = !css?.supports || css.supports('field-sizing', 'content')
  const fit = () => { if (native) return; el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }
  el.addEventListener('input', fit)
  fit()
  return { update: fit, destroy: () => el.removeEventListener('input', fit) }
}

/** Copy, confirm one sweep on `host`, and say so (05 Copy, 07 §6.4). */
export async function copyConfirm(el: Element, text: string, host: Element = el) {
  const doc = el.ownerDocument
  try {
    await doc.defaultView?.navigator.clipboard?.writeText(text)
    installSweep(doc).confirm(host)
    announce(doc, 'Copied to clipboard')
  } catch { announce(doc, 'Could not copy', true) }
}

/** The listening wave: the newest level enters at the start and the bars carry it along. */
export function speechWave(el: HTMLElement, _level?: number) {
  const bars = [...el.children] as HTMLElement[]
  const values = bars.map(() => 0)
  const push = (v: number) => {
    values.pop()
    values.unshift(v)
    bars.forEach((b, i) => b.style.setProperty('--a', values[i]!.toFixed(2)))
  }
  return { update: push, destroy() {} }
}

// ---- dictation: the browser's speech recognition behind SpeechInput ---------------------------------------------------

export type DictationState = 'idle' | 'listening' | 'blocked' | 'unsupported'
export interface DictationEvents { onState(s: DictationState): void; onTranscript(final: string, interim: string): void; onLevel(level: number): void }
export interface DictationEngine { start(mic?: string): void; stop(): void }

/** The audio inputs the browser will name (labels are empty until the mic has been allowed once). */
export async function listMics(win: Window) {
  const all = (await win.navigator.mediaDevices?.enumerateDevices?.().catch(() => [])) ?? []
  return all.filter(d => d.kind === 'audioinput' && d.deviceId).map(d => ({ value: d.deviceId, label: d.label || 'Microphone' }))
}

/** Web Speech for words, a mic stream and an analyser for the level. Blocked and unsupported are states, not throws. */
export function dictation(win: Window & { SpeechRecognition?: any; webkitSpeechRecognition?: any; AudioContext?: any }, on: DictationEvents): DictationEngine {
  let rec: any
  let stream: MediaStream | undefined
  let audio: any
  let raf = 0
  const release = () => {
    win.cancelAnimationFrame(raf)
    stream?.getTracks().forEach(t => t.stop())
    audio?.close?.()
    stream = audio = undefined
    on.onLevel(0)
  }
  const meter = async (mic?: string) => {
    try { stream = await win.navigator.mediaDevices?.getUserMedia({ audio: mic ? { deviceId: mic } : true }) }
    catch { rec?.abort?.(); rec = undefined; release(); return on.onState('blocked') }
    if (!stream || !win.AudioContext) return
    audio = new win.AudioContext()
    const an = audio.createAnalyser()
    audio.createMediaStreamSource(stream).connect(an)
    const buf = new Uint8Array(an.fftSize)
    const tick = () => {
      an.getByteTimeDomainData(buf)
      on.onLevel(Math.min(1, Math.max(...buf.map((v: number) => Math.abs(v - 128))) / 64))
      raf = win.requestAnimationFrame(tick)
    }
    tick()
  }
  return {
    start(mic) {
      const Speech = win.SpeechRecognition ?? win.webkitSpeechRecognition
      if (!Speech) return on.onState('unsupported')
      let final = ''
      rec = new Speech()
      rec.continuous = true
      rec.interimResults = true
      rec.onresult = (e: any) => {
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          if (r.isFinal) final += r[0].transcript
          else interim += r[0].transcript
        }
        on.onTranscript(final, interim)
      }
      rec.onerror = (e: any) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { rec = undefined; release(); on.onState('blocked') } }
      rec.onend = () => { if (rec) { rec = undefined; release(); on.onState('idle') } }
      rec.start()
      on.onState('listening')
      void meter(mic)
    },
    stop() { rec?.stop(); if (!rec) release() },
  }
}
