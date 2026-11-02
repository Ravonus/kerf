import { BranchIcon, CopyIcon, LeftIcon, RefreshIcon, RightIcon, ThumbsDownIcon, ThumbsUpIcon } from '@weft/icons'
import { announce, popover } from '@weft/warp-core'
import { derived, state } from 'weft'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { use } from '@weft/warp-core/weft'
import { IconButton } from './bits'
import '../styles'
import '@weft/warp-core/styles/components/popover.css'
import '@weft/warp-core/styles/app/branch.css'

const say = (e: Event, text: string) => announce((e.currentTarget as Element).ownerDocument, text)

/** BranchSwitcher (07 §1.3): `‹ 2/2 ›`, shown once a turn has more than one version. `index` counts from 0. */
export function BranchSwitcher({ index, count, onChange }: { index: number; count: number; onChange: (index: number) => void }) {
  const go = (e: Event, to: number) => { onChange(to); say(e, `Version ${to + 1} of ${count}`) }
  return (
    <>
      {count > 1 && (
        <span data-scope="branch" role="group" aria-label="Versions">
          <button type="button" aria-label="Previous version" disabled={index <= 0} onClick={e => go(e, index - 1)}><LeftIcon /></button>
          <span data-numeric="">{index + 1}/{count}</span>
          <button type="button" aria-label="Next version" disabled={index >= count - 1} onClick={e => go(e, index + 1)}><RightIcon /></button>
        </span>
      )}
    </>
  )
}

export type Feedback = 'up' | 'down' | null

export interface MessageActionsProps {
  /** Adds Copy, and is called with the pressed button. Copy the message text here. */
  onCopy?: (el: HTMLElement) => void
  /** Called with `up`, `down` or null when thumbs change, and the reason picked for a thumbs down. */
  onFeedback?: (value: Feedback, reason?: string) => void
  reasons?: string[]
  /** Adds Regenerate: ask for a new answer. */
  onRegenerate?: () => void
  /** Adds Branch: start a new conversation from this message. */
  onBranch?: () => void
  stopped?: boolean
  /** Which of several answers is shown, with arrows between them. */
  branch?: { index: number; count: number; onChange: (index: number) => void }
}

/**
 * Message actions (07 §1.3): copy, good and bad answer (toggles; bad opens a short reason popover), regenerate, branch
 * and the switcher. Regenerate, branch and thumbs render only when they have a handler.
 */
export function MessageActions({ onCopy, onFeedback, reasons = ['Wrong', 'Too long', 'Missed the point'], onRegenerate, onBranch, stopped, branch }: MessageActionsProps) {
  const value = state<Feedback>(null)
  const asking = state(false)
  const has = derived(() => branch)
  let bad: HTMLElement | undefined
  let panel: HTMLElement | undefined
  use(popover, () => panel, () => ({ open: asking.value, trigger: bad!, side: 'top' as const, onClose: () => (asking.value = false) }))
  const rate = (e: Event, to: 'up' | 'down') => {
    const next = value.value === to ? null : to
    value.value = next
    onFeedback?.(next)
    if (next === 'down') asking.value = true
    else if (next) say(e, 'Thanks for the feedback.')
  }
  const because = (e: Event, reason: string) => { onFeedback?.('down', reason); say(e, 'Thanks for the feedback.') }
  return (
    <div data-part="actions">
      {stopped && <Badge tone="neutral">Stopped · kept what arrived</Badge>}
      {onCopy && <IconButton icon={CopyIcon} label="Copy" onClick={(e: Event) => onCopy(e.currentTarget as HTMLElement)} />}
      {onFeedback && <IconButton icon={ThumbsUpIcon} label="Good answer" aria-pressed={value.value === 'up' ? 'true' : 'false'} onClick={(e: Event) => rate(e, 'up')} />}
      {onFeedback && <IconButton icon={ThumbsDownIcon} label="Bad answer" aria-pressed={value.value === 'down' ? 'true' : 'false'} aria-haspopup="dialog" ref={(n: any) => (bad = n)} onClick={(e: Event) => rate(e, 'down')} />}
      {onFeedback && (
        <div ref={(n: any) => (panel = n)} data-scope="popover" data-part="content" role="dialog" popover="manual" aria-label="What went wrong?">
          <p data-part="title">What went wrong?</p>
          <div>{reasons.map(r => <Button key={r} emphasis="ghost" tone="neutral" size="sm" data-close-popover="" onClick={(e: Event) => because(e, r)}>{r}</Button>)}</div>
        </div>
      )}
      {onRegenerate && <IconButton icon={RefreshIcon} label="Regenerate" onClick={onRegenerate} />}
      {onBranch && <IconButton icon={BranchIcon} label="Branch from here" onClick={onBranch} />}
      {has.value && <BranchSwitcher index={has.value.index} count={has.value.count} onChange={has.value.onChange} />}
    </div>
  )
}
