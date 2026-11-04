import { XIcon } from '@weft-js/warp-icons'
import { announce, uid } from '@weft-js/warp-core'
import { derived, state, watch } from '@weft-js/core'
import { Button } from '../Button'
import { Checkbox } from '../Choice'
import { toast } from '../Toast'
import { Mark, Rail } from './kit'
import '@weft-js/warp-core/styles/flows/checklist.css'
import '@weft-js/warp-core/styles/layout/row.css'

/** One onboarding task. */
export interface ChecklistItem {
  id: string
  title: unknown
  description?: unknown
  done?: boolean
  /** The frame button on the row's end. */
  action?: { label: string; onClick: () => void } | undefined
}

/** Props for Checklist. */
export interface ChecklistProps {
  title?: unknown
  subtitle?: unknown
  /** Derived from server state, never from clicks here: doing the task anywhere checks it. */
  items: ChecklistItem[]
  /** A user-checkable list instead; omit it and the boxes only report. */
  onToggle?: (id: string, done: boolean) => void
  doneTitle?: unknown
  doneDescription?: unknown
  /** Shows Hide; a Toast offers Undo for 10s. */
  onHide?: () => void
  onUndoHide?: () => void
  /** A disclosure on the title (phones: "3 of 5"). */
  collapsible?: boolean
  /** A row under the list: "Take the tour". */
  footer?: unknown
}

/** The onboarding checklist (09 §3.1): a counter in the head, a rail that fills per item, rows, then "You're set up". */
export function Checklist({
  title = 'Get set up',
  subtitle,
  items,
  onToggle,
  doneTitle = "You're set up",
  doneDescription,
  onHide,
  onUndoHide,
  collapsible,
  footer,
}: ChecklistProps) {
  const id = uid('ck')
  const list = derived(() => items)
  const count = derived(() => list.value.filter((i) => i.done).length)
  const total = derived(() => list.value.length)
  const hidden = state(false)
  const closed = state(false)
  watch(
    () => count.value,
    (n, was) => {
      if (was !== undefined && n > was)
        announce(document, n === total.value ? 'All set up.' : `${n} of ${total.value} done.`)
    },
  )
  const hide = () => {
    hidden.value = true
    onHide?.()
    toast.show({
      title: 'Checklist hidden',
      description: 'Find it again under Help.',
      duration: 10000,
      action: {
        label: 'Undo',
        onClick() {
          hidden.value = false
          onUndoHide?.()
        },
      },
    })
  }
  return (
    <section
      data-scope="checklist"
      data-state={count.value === total.value && total.value > 0 ? 'complete' : undefined}
      aria-labelledby={id}
      hidden={hidden.value || undefined}
    >
      <div data-part="head">
        <div>
          <h4 data-part="title" id={id} aria-level="3">
            {title}{' '}
            <span data-part="count">
              {count.value} of {total.value}
            </span>
          </h4>
          {subtitle !== undefined && <p>{subtitle}</p>}
        </div>
        <div data-scope="row">
          {collapsible && (
            <Button
              emphasis="ghost"
              tone="neutral"
              size="sm"
              aria-expanded={closed.value ? 'false' : 'true'}
              aria-controls={`${id}-l`}
              onClick={() => (closed.value = !closed.value)}
            >
              {closed.value ? 'Show' : 'Collapse'}
            </Button>
          )}
          {onHide && (
            <Button
              emphasis="ghost"
              tone="neutral"
              size="sm"
              icon={XIcon}
              label="Hide checklist"
              onClick={hide}
            />
          )}
        </div>
      </div>
      <div data-part="progress">
        <Rail
          value={total.value ? (count.value / total.value) * 100 : 0}
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin="0"
          aria-valuemax={total.value}
          aria-valuenow={count.value}
        />
      </div>
      <ol id={`${id}-l`} hidden={closed.value || undefined}>
        {list.value.map((it) => (
          <li key={it.id} data-part="item" data-state={it.done ? 'done' : undefined}>
            <Checkbox
              checked={!!it.done}
              disabled={!onToggle}
              aria-labelledby={`${id}-${it.id}`}
              onChange={(e: Event) =>
                onToggle?.(it.id, (e.currentTarget as HTMLInputElement).checked)
              }
            />
            <b id={`${id}-${it.id}`}>
              {it.title}
              <span data-part="sr-only">{it.done ? ', done' : ', to do'}</span>
            </b>
            {it.action ? (
              <Button data-part="action" emphasis="frame" size="sm" onClick={it.action.onClick}>
                {it.action.label}
              </Button>
            ) : (
              <span></span>
            )}
            {it.description !== undefined && <p>{it.description}</p>}
          </li>
        ))}
      </ol>
      <div data-part="done">
        <Mark tone="positive" draw />
        <div>
          <b>{doneTitle}</b>
          {doneDescription !== undefined && <p>{doneDescription}</p>}
        </div>
      </div>
      {footer}
    </section>
  )
}
