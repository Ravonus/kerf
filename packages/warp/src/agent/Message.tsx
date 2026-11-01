import { CopyIcon, EditIcon } from '@weft/icons'
import { copyConfirm, installSweep } from '@weft/warp-core'
import { onMount, state, untrack } from 'weft'
import { Button } from '../Button'
import { Textarea } from '../Field'
import { IconButton, Sweep } from './bits'
import '../styles'
import '@weft/warp-core/styles/app/message.css'

/**
 * The user's turn (07 §1.1): a prompt bubble with edit and copy. `arrive` is a message just sent: it enters and
 * confirms one sweep. Edit opens the bubble as a Textarea in place; saving is `onEdit` (a new branch).
 */
export function Message({ text, arrive, onEdit }: { text: string; arrive?: boolean; onEdit?: (text: string) => void }) {
  const editing = state(false)
  const draft = state('')
  let bubble: HTMLElement | undefined
  let root: HTMLElement | undefined
  onMount(() => { const s = installSweep(); if (untrack(() => arrive)) requestAnimationFrame(() => s.confirm(bubble)) })
  const open = () => {
    draft.value = text
    editing.value = true
    queueMicrotask(() => root?.querySelector('textarea')?.focus())
  }
  const close = () => {
    editing.value = false
    queueMicrotask(() => root?.querySelector<HTMLElement>('[aria-label="Edit message"]')?.focus())
  }
  const save = () => { const t = draft.value.trim(); close(); if (t && t !== text) onEdit?.(t) }
  return (
    <div ref={(n: any) => (root = n)} data-scope="message" data-mine="" data-arrive={arrive ? '' : undefined}>
      <div data-part="body">
        {editing.value ? (
          <>
            <Textarea label="Edit message" value={draft.value} onInput={e => (draft.value = e.currentTarget.value)} onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close() } }} />
            <div data-part="status">
              <Button size="sm" onClick={save}>Save</Button>
              <Button emphasis="ghost" tone="neutral" size="sm" onClick={close}>Cancel</Button>
            </div>
          </>
        ) : (
          <>
            <div ref={(n: any) => (bubble = n)} data-part="bubble" data-variant="prompt" data-sweep=""><Sweep />{text}</div>
            <div data-part="status" style="gap:2px">
              {onEdit && <IconButton icon={EditIcon} label="Edit message" onClick={open} />}
              <IconButton icon={CopyIcon} label="Copy" onClick={(e: Event) => copyConfirm(e.currentTarget as Element, text, bubble)} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
