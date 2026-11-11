// The veneer-core half of the agent pack (07 §1): pure logic and actions, no framework. `foldAnswer` is the one path from
// an event stream to what the UI draws, so replay, reconnect and SSR hydration all render the same value.
import type { TraceRow } from './agent-trace'
import { formatSeconds, formatTokens } from './agent-format'

/** Where a tool call stands. */
export type ToolState = 'running' | 'done' | 'failed' | 'approval' | 'denied'
/** Where a plan step stands. */
export type TaskState = 'pending' | 'running' | 'done' | 'blocked'
/** Where an answer stands, from waiting to finished. */
export type AnswerState = 'waiting' | 'streaming' | 'approval' | 'done' | 'stopped' | 'error'

/** Something an answer cites. */
export interface AgentSource {
  id?: string | undefined
  title: string
  path?: string
  snippet?: string
  url?: string
}
/** One tool call in an answer, from its arguments to its output. */
export interface AgentTool {
  id: string
  name: string
  args: string
  state: ToolState
  output?: string | undefined
  ms?: number | undefined
  exit?: number | undefined
  startedAt?: number | undefined
}
/** A question the agent put to the user, and the answer once there is one. */
export interface AgentQuestion {
  id: string
  prompt: string
  options: string[]
  multiple?: boolean | undefined
  free?: boolean | undefined
  answer?: string | string[] | undefined
  closed?: boolean
}
/** One step of the agent's plan. */
export interface PlanStep {
  id: string
  title: string
  state: TaskState
  note?: string | undefined
}
/** One piece of an answer, in the order it arrived. */
export type AnswerBlock =
  | {
      kind: 'reasoning'
      id: string
      text: string
      streaming: boolean
      seconds?: number | undefined
      startedAt?: number | undefined
    }
  | { kind: 'text'; id: string; text: string }
  | { kind: 'tool'; id: string }
  | { kind: 'question'; id: string; question: AgentQuestion }
/** An agent's answer as the events have folded it so far. */
export interface Answer {
  state: AnswerState
  blocks: AnswerBlock[]
  tools: AgentTool[]
  sources: AgentSource[]
  plan: PlanStep[]
  error?: string
}

/** 07 §1.7. `at` is a timestamp in ms, kept in the event so a replay computes the same durations. */
export type AgentEvent =
  | { kind: 'reasoning'; text: string; at?: number }
  | { kind: 'text'; text: string; at?: number }
  /** A tool starts; the same id again (after an approval) runs it. */
  | { kind: 'tool'; id: string; name?: string; args?: string; at?: number }
  | {
      kind: 'tool-result'
      id: string
      output?: string | undefined
      exit?: number | undefined
      failed?: boolean
      denied?: boolean
      ms?: number | undefined
      at?: number
    }
  | { kind: 'approval'; id: string; name?: string; args?: string; at?: number }
  /** A question asked; the same id with `answer` closes it. */
  | {
      kind: 'question'
      id: string
      prompt?: string
      options?: string[]
      multiple?: boolean | undefined
      free?: boolean | undefined
      answer?: string | string[] | undefined
      at?: number
    }
  | ({ kind: 'source'; at?: number } & AgentSource)
  /** The whole plan (`steps`), or one step's change (`id`, `state`, `note`). */
  | {
      kind: 'plan'
      steps?: PlanStep[]
      id?: string | undefined
      state?: TaskState | undefined
      note?: string | undefined
      at?: number
    }
  | { kind: 'done'; stopped?: boolean; at?: number }
  | { kind: 'error'; message: string; at?: number }

/** An answer before its first event. */
export const emptyAnswer = (): Answer => ({
  state: 'waiting',
  blocks: [],
  tools: [],
  sources: [],
  plan: [],
})

const seal = (b: AnswerBlock, at?: number): AnswerBlock => {
  if (b.kind !== 'reasoning' || !b.streaming) return b
  const seconds =
    b.seconds ??
    (at !== undefined && b.startedAt !== undefined
      ? Math.max(1, Math.round((at - b.startedAt) / 1000))
      : undefined)
  return { ...b, streaming: false, seconds }
}
const sealAll = (blocks: AnswerBlock[], at?: number) => blocks.map((b) => seal(b, at))
const upsert = <T extends { id: string }>(
  list: T[],
  id: string,
  make: () => T,
  change: (x: T) => T,
) => {
  const at = list.findIndex((x) => x.id === id)
  return at < 0 ? [...list, change(make())] : list.map((x, i) => (i === at ? change(x) : x))
}

function settle(a: Answer): AnswerState {
  if (a.state === 'done' || a.state === 'stopped' || a.state === 'error') return a.state
  if (
    a.tools.some((t) => t.state === 'approval') ||
    a.blocks.some((b) => b.kind === 'question' && b.question.answer === undefined)
  )
    return 'approval'
  return a.blocks.length ? 'streaming' : 'waiting'
}

function step(a: Answer, e: AgentEvent): Answer {
  const n = { ...a }
  switch (e.kind) {
    case 'reasoning':
    case 'text':
    case 'tool':
    case 'approval':
    case 'tool-result':
      applyContent(a, n, e)
      break
    case 'question':
    case 'source':
    case 'plan':
    case 'done':
    case 'error':
      applyOutcome(a, n, e)
  }
  n.state = settle(n)
  return n
}

function applyContent(
  a: Answer,
  n: Answer,
  e: Extract<AgentEvent, { kind: 'reasoning' | 'text' | 'tool' | 'approval' | 'tool-result' }>,
) {
  switch (e.kind) {
    case 'reasoning': {
      const last = a.blocks.at(-1)
      if (last?.kind === 'reasoning' && last.streaming)
        n.blocks = [...a.blocks.slice(0, -1), { ...last, text: last.text + e.text }]
      else
        n.blocks = [
          ...a.blocks,
          {
            kind: 'reasoning',
            id: `b${a.blocks.length}`,
            text: e.text,
            streaming: true,
            startedAt: e.at,
          },
        ]
      break
    }
    case 'text': {
      const blocks = sealAll(a.blocks, e.at)
      const last = blocks.at(-1)
      n.blocks =
        last?.kind === 'text'
          ? [...blocks.slice(0, -1), { ...last, text: last.text + e.text }]
          : [...blocks, { kind: 'text', id: `b${blocks.length}`, text: e.text }]
      break
    }
    case 'tool':
    case 'approval': {
      const state: ToolState = e.kind === 'tool' ? 'running' : 'approval'
      const had = a.tools.some((t) => t.id === e.id)
      n.tools = upsert(
        a.tools,
        e.id,
        () => ({ id: e.id, name: e.name ?? e.id, args: '', state, startedAt: e.at }),
        (t) => ({
          ...t,
          name: e.name ?? t.name,
          args: e.args ?? t.args,
          state,
          startedAt: state === 'running' ? (e.at ?? t.startedAt) : t.startedAt,
        }),
      )
      n.blocks = sealAll(a.blocks, e.at)
      if (!had) n.blocks = [...n.blocks, { kind: 'tool', id: e.id }]
      break
    }
    case 'tool-result': {
      const state: ToolState = e.denied
        ? 'denied'
        : e.failed || (e.exit ?? 0) !== 0
          ? 'failed'
          : 'done'
      n.tools = upsert(
        a.tools,
        e.id,
        () => ({ id: e.id, name: e.id, args: '', state }),
        (t) => ({
          ...t,
          state,
          output: e.output ?? t.output,
          exit: e.exit,
          ms: e.ms ?? (e.at !== undefined && t.startedAt !== undefined ? e.at - t.startedAt : t.ms),
        }),
      )
      break
    }
  }
}

function applyOutcome(
  a: Answer,
  n: Answer,
  e: Extract<AgentEvent, { kind: 'question' | 'source' | 'plan' | 'done' | 'error' }>,
) {
  switch (e.kind) {
    case 'question': {
      const has = a.blocks.some((b) => b.kind === 'question' && b.id === e.id)
      if (has)
        n.blocks = a.blocks.map((b) =>
          b.kind === 'question' && b.id === e.id
            ? { ...b, question: { ...b.question, answer: e.answer ?? b.question.answer } }
            : b,
        )
      else
        n.blocks = [
          ...sealAll(a.blocks, e.at),
          {
            kind: 'question',
            id: e.id,
            question: {
              id: e.id,
              prompt: e.prompt ?? '',
              options: e.options ?? [],
              multiple: e.multiple,
              free: e.free,
              answer: e.answer,
            },
          },
        ]
      break
    }
    case 'source': {
      const { kind: _k, at: _a, ...src } = e
      if (!(src.id && a.sources.some((s) => s.id === src.id))) n.sources = [...a.sources, src]
      break
    }
    case 'plan':
      if (e.steps) n.plan = e.steps
      else if (e.id)
        n.plan = a.plan.map((s) =>
          s.id === e.id ? { ...s, state: e.state ?? s.state, note: e.note } : s,
        )
      break
    case 'done':
      n.blocks = sealAll(a.blocks, e.at).map((b) =>
        b.kind === 'question' && b.question.answer === undefined
          ? { ...b, question: { ...b.question, closed: true } }
          : b,
      )
      n.state = e.stopped ? 'stopped' : 'done'
      n.tools = a.tools.map((t) =>
        t.state === 'running'
          ? { ...t, state: 'failed', output: t.output ?? 'Stopped' }
          : t.state === 'approval'
            ? { ...t, state: 'denied' }
            : t,
      )
      n.plan = a.plan.map((s) =>
        s.state === 'done'
          ? s
          : {
              ...s,
              note: undefined,
              state: e.stopped ? 'pending' : s.state === 'running' ? 'done' : s.state,
            },
      )
      break
    case 'error':
      n.blocks = sealAll(a.blocks, e.at)
      n.state = 'error'
      n.error = e.message
      n.tools = a.tools.map((t) =>
        t.state === 'running' || t.state === 'approval' ? { ...t, state: 'failed' } : t,
      )
      break
  }
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

export { parseText, parseInline } from './agent-text'
export type { TextBlock, Inline } from './agent-text'

/** All the answer's text, for Copy. */
export const answerText = (a: Answer) =>
  a.blocks.flatMap((b) => (b.kind === 'text' ? [b.text] : [])).join('\n\n')

// ---- small rules -----------------------------------------------------------------------------------------------------

export { formatSeconds, formatClock, formatTokens, contextLevel } from './agent-format'

/** What a ToolCall says: the short status at its end, and the words only a screen reader gets before it. */
export function toolStatus(t: AgentTool) {
  const status =
    t.state === 'running'
      ? 'running'
      : t.state === 'approval'
        ? 'needs approval'
        : t.state === 'denied'
          ? 'denied'
          : t.state === 'failed'
            ? t.exit !== undefined
              ? `exit ${t.exit}`
              : 'failed'
            : t.ms !== undefined
              ? formatSeconds(t.ms)
              : 'done'
  // said before the visible status: "run_tests, failed, exit 1"
  const word =
    t.state === 'done' && status !== 'done'
      ? ', done, '
      : t.state === 'failed' && status !== 'failed'
        ? ', failed, '
        : ', '
  return { status, word }
}

export { argsDiff, suggestQuery, applySuggest } from './agent-edit'

export { traceRows, traceKey } from './agent-trace'
export type { TraceSpan, TraceRow } from './agent-trace'

/** A span's time, tokens and cost as one line. */
export const traceSummary = (r: Pick<TraceRow, 'ms' | 'tokens' | 'cost'>) =>
  [
    formatSeconds(r.ms),
    r.tokens !== undefined ? `${formatTokens(r.tokens)} tok` : undefined,
    r.cost !== undefined ? `$${r.cost.toFixed(3)}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ')

export { stick, citePreview, autosize, copyConfirm, speechWave } from './agent-actions'
export type { StickOptions, CiteOptions } from './agent-actions'

// ---- dictation: the browser's speech recognition behind SpeechInput ---------------------------------------------------

export { dictation, listMics } from './agent-dictation'
export type {
  DictationState,
  DictationEvents,
  DictationEngine,
  Recognizer,
} from './agent-dictation'
