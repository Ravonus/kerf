import { dirtyKeys, leaveGuard, plural } from '@weft-js/warp-core'
import { derived, onCleanup, state, type State, untrack } from '@weft-js/core'
import { Button } from '../Button'
import { toast } from '../Toast'
import { use } from '@weft-js/warp-core/weft'
import { ConfirmDialog } from './Danger'
import { afterFlush } from './atoms'
import '../styles'
import '@weft-js/warp-core/styles/flows/tokens.css'
import '@weft-js/warp-core/styles/flows/base.css'
import '@weft-js/warp-core/styles/rich/helpers.css'
import '@weft-js/warp-core/styles/layout/tokens.css'
import '@weft-js/warp-core/styles/layout/row.css'
import '@weft-js/warp-core/styles/layout/stack.css'
import '@weft-js/warp-core/styles/flows/save-bar.css'

const SAVED_MS = 1500

/** Messages by field name. */
export type FieldErrors = Record<string, string>
/** Props for SaveBar. */
export interface SaveBarProps<T extends Record<string, unknown>> {
  /** The live form values. The bar snapshots them at mount and after each save. */
  values: State<T>
  /** Field errors, written here for the fields to read. */
  errors?: State<FieldErrors> | undefined
  /** Client checks; anything returned stops the save. */
  validate?: ((values: T) => FieldErrors) | undefined
  /** Resolve with field errors to keep the bar; throw on a transport failure. */
  onSave: (values: T) => Promise<FieldErrors | void> | FieldErrors | void
  /** Called after Discard has put the snapshot back. */
  onDiscard?: () => void
  /** Where a confirmed leave goes. Default: the browser navigates. */
  onLeave?: (href: string) => void
}

/**
 * The save bar (09 §4.1): a dock that rises when the values differ from their snapshot. Save keeps it up with a
 * pending button, then says Saved for 1.5 s; field errors keep it and focus the first invalid field. Leaving while
 * dirty asks. Enter in the enclosing form saves.
 */
export function SaveBar<T extends Record<string, unknown>>({ values, errors, validate, onSave, onDiscard, onLeave }: SaveBarProps<T>) {
  const box = untrack(() => values)
  const base = state<T>(untrack(() => box.value))
  const phase = state<'idle' | 'pending' | 'saved'>('idle')
  const fixes = state(0)
  const leaving = state(false)
  let target = ''
  let el: HTMLDivElement | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(timer))

  const changed = derived(() => dirtyKeys(base.value, box.value))
  const dirty = derived(() => changed.value.length > 0)
  const message = derived(() => (phase.value === 'saved' ? 'Saved' : fixes.value ? `Fix ${plural(fixes.value, 'field')} to save` : 'You have unsaved changes'))
  const fail = (found: FieldErrors) => {
    if (errors) errors.value = found
    fixes.value = Object.keys(found).length
    afterFlush(() => el?.closest('form')?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }
  const save = async () => {
    if (phase.value === 'pending' || !dirty.value) return
    const now = box.value
    const found = validate?.(now)
    if (found && Object.keys(found).length) return fail(found)
    phase.value = 'pending'
    try {
      const back = await onSave(now)
      if (back && Object.keys(back).length) { phase.value = 'idle'; return fail(back) }
    } catch {
      phase.value = 'idle'
      toast.show({ title: 'That didn’t save', description: 'Your changes are still here.', tone: 'critical', action: { label: 'Retry', onClick: save } })
      return
    }
    if (errors) errors.value = {}
    fixes.value = 0
    base.value = now
    phase.value = 'saved'
    timer = setTimeout(() => (phase.value = 'idle'), SAVED_MS)
  }
  const discard = () => {
    box.value = base.value
    if (errors) errors.value = {}
    fixes.value = 0
    onDiscard?.()
  }
  const leave = () => {
    leaving.value = false
    discard()
    if (onLeave) onLeave(target)
    else el?.ownerDocument.defaultView?.location.assign(target)
  }
  use(leaveGuard, () => el, () => ({ dirty: dirty.value, onAttempt: (href: string) => { target = href; leaving.value = true } }))
  use((node: HTMLDivElement) => {
    const form = node.closest('form')
    const submit = (e: Event) => { e.preventDefault(); void save() }
    form?.addEventListener('submit', submit)
    return { update() {}, destroy: () => form?.removeEventListener('submit', submit) }
  }, () => el)
  return (
    <>
      <div ref={n => (el = n)} data-scope="save-bar" data-open={dirty.value || phase.value !== 'idle' ? '' : undefined} role="region" aria-label="Unsaved changes">
        <p data-part="msg" role="status">{message.value}</p>
        <div data-part="actions">
          <Button emphasis="ghost" tone="neutral" size="sm" style="--_ink:var(--warp-color-on-inverse)" disabled={phase.value === 'pending'} onClick={discard}>Discard</Button>
          <Button size="sm" loading={phase.value === 'pending'} onClick={save}>Save changes</Button>
        </div>
      </div>
      <ConfirmDialog open={leaving} title="Leave without saving?" description="Your changes on this page will be lost." action="Discard and leave" cancel="Stay" tone="critical" onConfirm={leave} />
    </>
  )
}
