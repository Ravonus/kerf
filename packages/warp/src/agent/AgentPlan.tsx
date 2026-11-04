import { CheckIcon, ClockIcon, HandIcon, XIcon } from '@weft-js/warp-icons'
import type { PlanStep } from '@weft-js/warp-core'
import { derived } from '@weft-js/core'
import { Bar, IconButton } from './bits'
import '../styles'
import '@weft-js/warp-core/styles/components/spinner.css'
import '@weft-js/warp-core/styles/app/plan.css'

/** A message waiting for the agent to finish. */
export type QueuedMessage = { id: string; text: string }

/**
 * Plan: the task list and the Queue (07 §1.1, §1.2). Steps are pending, running, done or blocked; messages sent during
 * a run wait in order under them and can be removed. Named AgentPlan so it can't be mistaken for a billing plan.
 */
export function AgentPlan({
  steps,
  queue,
  title = 'Plan',
  onRemoveQueued,
}: {
  steps: PlanStep[]
  queue?: QueuedMessage[]
  title?: unknown
  onRemoveQueued?: (id: string) => void
}) {
  const done = derived(() => steps.filter((s) => s.state === 'done').length)
  const waiting = derived(() => queue ?? [])
  const note = (s: PlanStep) =>
    s.note ??
    (s.state === 'blocked'
      ? 'Waiting for your approval'
      : s.state === 'running'
        ? 'In progress'
        : undefined)
  return (
    <div data-scope="plan">
      <div data-part="header">
        <h4>{title}</h4>
        <small data-numeric="">
          {done.value}/{steps.length}
        </small>
      </div>
      <Bar label="Plan progress" value={steps.length ? done.value / steps.length : 0} />
      <ol aria-label="Plan steps">
        {steps.map((s) => (
          <li key={s.id} data-state={s.state}>
            <span data-part="box">
              {s.state === 'done' && (
                <CheckIcon style="inline-size:12px;block-size:12px;stroke-width:2.2" />
              )}
              {s.state === 'running' && (
                <span
                  data-scope="spinner"
                  style="--_size:10px;color:var(--warp-color-accent-text)"
                ></span>
              )}
              {s.state === 'blocked' && <HandIcon style="inline-size:11px;block-size:11px" />}
            </span>
            <span>
              {s.title}
              {note(s) !== undefined && <small>{note(s)}</small>}
            </span>
          </li>
        ))}
      </ol>
      <div data-part="queue" role="group" aria-label="Queued messages">
        <span data-part="eyebrow">Queue · {waiting.value.length}</span>
        {waiting.value.length === 0 && (
          <small>Messages you send while a run is busy wait here, in order.</small>
        )}
        {waiting.value.map((q) => (
          <div key={q.id}>
            <ClockIcon style="inline-size:14px;block-size:14px;color:var(--warp-color-text-subtle)" />
            <span>{q.text}</span>
            <IconButton
              icon={XIcon}
              label={`Remove from queue: ${q.text}`}
              onClick={() => onRemoveQueued?.(q.id)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
