import { SparkleIcon } from '@weft-js/warp-icons'
import {
  announce,
  answerText,
  copyConfirm,
  uid,
  type AgentTool,
  type Answer,
  type AnswerBlock,
} from '@weft-js/warp-core'
import { derived, onMount, untrack, watch } from '@weft-js/core'
import { Alert } from '../Alert'
import { Button } from '../Button'
import { MessageActions, type Feedback } from './Actions'
import { Prose } from './Prose'
import { Question } from './Question'
import { Reasoning } from './Reasoning'
import { Sources } from './Sources'
import { ToolCall } from './ToolCall'
import '../styles'
import '@weft-js/warp-core/styles/app/assistant.css'

/** Props for Assistant. */
export interface AssistantProps {
  /** The folded value: `foldAnswer(events)`, or what a stream folds to. */
  answer: Answer
  /** The turn number, for its name: "Assistant answer 2". */
  n?: number
  arrive?: boolean
  /** Was there on load: approvals and questions take no focus and announce nothing. */
  quiet?: boolean | undefined
  /** Render a block of answer text yourself (Markdown, say); the default is `Prose`. */
  render?: (text: string, answer: Answer) => unknown
  /** Called when a tool call is approved, with its arguments as edited and whether to always allow it. */
  onApprove?: (tool: AgentTool, args: string, always: boolean) => void
  /** Called when a tool call is denied. */
  onDeny?: (tool: AgentTool) => void
  alwaysAllow?: (tool: AgentTool) => string | undefined
  /** Called with a question's id and the answer picked or typed. */
  onAnswer?: (id: string, answer: string | string[]) => void
  /** Called with `up`, `down` or null when thumbs change, and the reason picked for a thumbs down. */
  onFeedback?: (value: Feedback, reason?: string) => void
  /** Adds Regenerate: ask for a new answer. */
  onRegenerate?: () => void
  /** Adds Branch: start a new conversation from this answer. */
  onBranch?: () => void
  /** Which of several answers is shown, with arrows between them. */
  branch?: { index: number; count: number; onChange: (index: number) => void }
}

type Thought = Extract<AnswerBlock, { kind: 'reasoning' }>
type Said = Extract<AnswerBlock, { kind: 'text' }>
type Asked = Extract<AnswerBlock, { kind: 'question' }>

function Block({ block, base, p }: { block: AnswerBlock; base: string; p: AssistantProps }) {
  const tool = derived(() => p.answer.tools.find((t) => t.id === block.id))
  const kind = derived(() => block.kind)
  // once per kind: a row's nodes are read again whenever the list changes
  const view = derived(() => {
    const k = kind.value
    return untrack(() => {
      if (k === 'reasoning')
        return (
          <Reasoning
            text={(block as Thought).text}
            streaming={(block as Thought).streaming}
            seconds={(block as Thought).seconds}
          />
        )
      if (k === 'text')
        return p.render ? (
          <>{p.render((block as Said).text, p.answer)}</>
        ) : (
          <Prose text={(block as Said).text} sources={p.answer.sources} base={base} />
        )
      if (k === 'question')
        return (
          <Question
            question={(block as Asked).question}
            quiet={p.quiet}
            onAnswer={(a) => p.onAnswer?.(block.id, a)}
          />
        )
      return (
        <ToolCall
          call={tool.value!}
          quiet={p.quiet}
          alwaysAllow={p.alwaysAllow?.(tool.value!)}
          onApprove={(a, al) => p.onApprove?.(tool.value!, a, al)}
          onDeny={() => p.onDeny?.(tool.value!)}
        />
      )
    })
  })
  return <>{view.value}</>
}

/**
 * The assistant's turn (07 §1.1, §1.2): renders the folded Answer only, so replay and hydration take the same path.
 * Caret while streaming, aria-busy until done; the end of a turn is announced once, never each token.
 */
export function Assistant(p: AssistantProps) {
  const base = uid('ans')
  const st = derived(() => p.answer.state)
  const busy = derived(
    () => st.value === 'waiting' || st.value === 'streaming' || st.value === 'approval',
  )
  const empty = derived(() => p.answer.blocks.length === 0 && st.value !== 'error')
  const blocks = derived(() => p.answer.blocks)
  const many = derived(() => p.answer.sources.length > 0)
  let root: HTMLElement | undefined
  onMount(() => {
    watch(
      () => st.value,
      (s, prev) => {
        if (prev === undefined || !root) return
        const doc = root.ownerDocument
        if (s === 'done') announce(doc, 'Answer ready')
        if (s === 'stopped') announce(doc, 'Stopped')
        if (s === 'error') announce(doc, 'The answer failed', true)
      },
    )
  })
  return (
    <article
      ref={(n) => (root = n)}
      data-scope="assistant"
      data-state={st.value}
      aria-label={p.n !== undefined ? `Assistant answer ${p.n}` : 'Assistant answer'}
      aria-busy={busy.value ? 'true' : undefined}
      data-arrive={p.arrive ? '' : undefined}
    >
      <span data-part="mark">
        <SparkleIcon />
      </span>
      <div data-part="content">
        {empty.value && <p></p>}
        {blocks.value.map((b) => (
          <Block key={b.id} block={b} base={base} p={p} />
        ))}
        {st.value === 'error' && (
          <Alert tone="critical" title="The answer failed">
            {p.answer.error}
            {p.onRegenerate && (
              <>
                {' '}
                <Button emphasis="link" tone="neutral" onClick={p.onRegenerate}>
                  Retry
                </Button>
              </>
            )}
          </Alert>
        )}
        {many.value && <Sources items={p.answer.sources} base={base} />}
      </div>
      {!busy.value && (
        <MessageActions
          stopped={st.value === 'stopped'}
          onCopy={(el) => void copyConfirm(el, answerText(untrack(() => p.answer)))}
          onFeedback={p.onFeedback}
          onRegenerate={p.onRegenerate}
          onBranch={p.onBranch}
          branch={p.branch}
        />
      )}
    </article>
  )
}
