import { dirtyKeys, leaveGuard, plural } from '@kerf-js/veneer-core'
import { derived, onCleanup, state, type State, untrack } from '@kerf-js/core'
import { Button } from '../Button'
import { use } from '@kerf-js/veneer-core/kerf'
import { ConfirmDialog } from './Danger'
import { saveActions } from './SaveBar/actions'
import '../styles'
import '@kerf-js/veneer-core/styles/flows/tokens.css'
import '@kerf-js/veneer-core/styles/flows/base.css'
import '@kerf-js/veneer-core/styles/rich/helpers.css'
import '@kerf-js/veneer-core/styles/layout/tokens.css'
import '@kerf-js/veneer-core/styles/layout/row.css'
import '@kerf-js/veneer-core/styles/layout/stack.css'
import '@kerf-js/veneer-core/styles/flows/save-bar.css'

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
export function SaveBar<T extends Record<string, unknown>>({
  values,
  errors,
  validate,
  onSave,
  onDiscard,
  onLeave,
}: SaveBarProps<T>) {
  const box = untrack(() => values)
  const base = state<T>(untrack(() => box.value))
  const phase = state<'idle' | 'pending' | 'saved'>('idle')
  const fixes = state(0)
  const leaving = state(false)
  const refs: {
    target: string
    el?: HTMLDivElement | undefined
    timer?: ReturnType<typeof setTimeout> | undefined
  } = { target: '' }
  onCleanup(() => clearTimeout(refs.timer))

  const changed = derived(() => dirtyKeys(base.value, box.value))
  const dirty = derived(() => changed.value.length > 0)
  const message = derived(() =>
    phase.value === 'saved'
      ? 'Saved'
      : fixes.value
        ? `Fix ${plural(fixes.value, 'field')} to save`
        : 'You have unsaved changes',
  )
  const { save, discard, leave } = saveActions({
    d: { box, base, phase, fixes, leaving, dirty, refs },
    errors: () => errors,
    validate: (now) => validate?.(now),
    onSave: (now) => onSave(now),
    onDiscard: () => onDiscard?.(),
    hasLeave: () => onLeave,
    onLeave: () => onLeave!(refs.target),
  })
  bindSaveBar({ refs, dirty, leaving, save })
  return (
    <>
      <div
        ref={(n) => (refs.el = n)}
        data-scope="save-bar"
        data-open={dirty.value || phase.value !== 'idle' ? '' : undefined}
        role="region"
        aria-label="Unsaved changes"
      >
        <p data-part="msg" role="status">
          {message.value}
        </p>
        <div data-part="actions">
          <Button
            emphasis="ghost"
            tone="neutral"
            size="sm"
            style="--_ink:var(--veneer-color-on-inverse)"
            disabled={phase.value === 'pending'}
            onClick={discard}
          >
            Discard
          </Button>
          <Button size="sm" loading={phase.value === 'pending'} onClick={save}>
            Save changes
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={leaving}
        title="Leave without saving?"
        description="Your changes on this page will be lost."
        action="Discard and leave"
        cancel="Stay"
        tone="critical"
        onConfirm={leave}
      />
    </>
  )
}

function bindSaveBar({
  refs,
  dirty,
  leaving,
  save,
}: {
  refs: { target: string; el?: HTMLDivElement | undefined }
  dirty: { readonly value: boolean }
  leaving: State<boolean>
  save: () => Promise<void>
}) {
  use(
    leaveGuard,
    () => refs.el,
    () => ({
      dirty: dirty.value,
      onAttempt: (href: string) => {
        refs.target = href
        leaving.value = true
      },
    }),
  )
  use(
    (node: HTMLDivElement) => {
      const form = node.closest('form')
      const submit = (e: Event) => {
        e.preventDefault()
        void save()
      }
      form?.addEventListener('submit', submit)
      return { update() {}, destroy: () => form?.removeEventListener('submit', submit) }
    },
    () => refs.el,
  )
}
