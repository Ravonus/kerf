import { TrashIcon, type IconComponent } from '@weft-js/warp-icons'
import { confirmMatches } from '@weft-js/warp-core'
import { derived, state, type State, untrack, watch } from '@weft-js/core'
import { Button, type Tone } from '../Button'
import { Input } from '../Field'
import { Modal } from '../Modal'
import { Glyph } from '../parts'
import { toast } from '../Toast'
import { latch } from './atoms'
import { SettingsSection } from './Settings'
import '../styles'
import '@weft-js/warp-core/styles/flows/tokens.css'
import '@weft-js/warp-core/styles/flows/base.css'
import '@weft-js/warp-core/styles/rich/helpers.css'
import '@weft-js/warp-core/styles/layout/tokens.css'
import '@weft-js/warp-core/styles/layout/row.css'
import '@weft-js/warp-core/styles/layout/stack.css'
import '@weft-js/warp-core/styles/flows/meter.css' // the result mark
import '@weft-js/warp-core/styles/flows/confirm.css'

/** The danger zone (09 §4.4): the one critical-bordered section. Rows are SettingRows. */
export function DangerZone({
  id = 'danger',
  title = 'Danger zone',
  description,
  children,
}: {
  id?: string
  title?: unknown
  description?: unknown
  children: unknown
}) {
  return (
    <SettingsSection id={id} title={title} description={description} tone="critical">
      {children}
    </SettingsSection>
  )
}

/** Props for ConfirmDialog. */
export interface ConfirmDialogProps {
  open: State<boolean>
  title: unknown
  description?: unknown
  /** The confirm button: says what it does, with the count on a batch ("Remove 2 members"). */
  action: unknown
  cancel?: string
  tone?: Tone | undefined
  /** Drawn at the top of the body, in the result mark. */
  glyph?: string | IconComponent
  children?: unknown
  onConfirm: () => Promise<void> | void
  onCancel?: () => void
}

const failed = (retry: () => unknown) =>
  toast.show({
    title: 'That didn’t go through',
    description: 'Nothing changed. Try again.',
    tone: 'critical',
    action: { label: 'Retry', onClick: retry },
  })

/** A plain AlertDialog (05 §3): focus on Cancel. Pending on the confirm button; the dialog closes when it's done. */
export function ConfirmDialog({
  open,
  title,
  description,
  action,
  cancel = 'Cancel',
  tone,
  glyph,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const armed = latch(untrack(() => open))
  const busy = state(false)
  const go = async () => {
    if (busy.value) return
    busy.value = true
    try {
      await onConfirm()
      open.value = false
    } catch {
      failed(go)
    } finally {
      busy.value = false
    }
  }
  return (
    <>
      {armed.value && (
        <Modal
          open={open}
          alert
          size="sm"
          title={title}
          description={description}
          mark={
            glyph ? (
              <span data-part="mark" data-tone={tone === 'critical' ? 'critical' : undefined}>
                {typeof glyph === 'string' ? <Glyph d={glyph} /> : glyph({})}
              </span>
            ) : undefined
          }
          footer={
            <>
              <Button emphasis="frame" autofocus data-close="" onClick={() => onCancel?.()}>
                {cancel}
              </Button>
              <Button tone={tone} loading={busy.value} onClick={go}>
                {action}
              </Button>
            </>
          }
        >
          {children}
        </Modal>
      )}
    </>
  )
}

/** Props for TypeToConfirm. */
export interface TypeToConfirmProps {
  open: State<boolean>
  title: unknown
  description?: unknown
  /** The exact text to type: the project's or key's name. */
  confirmText: string
  /** What goes, listed. */
  items?: string[]
  action: unknown
  glyph?: string | IconComponent
  onConfirm: () => Promise<void> | void
}

/**
 * Type-to-confirm (09 §4.4): an AlertDialog whose field sweeps critical. Deviation from 05: focus goes to the field,
 * not Cancel. The confirm stays disabled until the text matches exactly, and Enter submits only then.
 */
export function TypeToConfirm({
  open,
  title,
  description,
  confirmText,
  items,
  action,
  glyph = TrashIcon,
  onConfirm,
}: TypeToConfirmProps) {
  const armed = latch(untrack(() => open))
  const typed = state('')
  const busy = state(false)
  const ok = derived(() => confirmMatches(typed.value, confirmText))
  watch(
    () => open.value,
    (on) => {
      if (on) typed.value = ''
    },
  )
  const go = async () => {
    if (!ok.value || busy.value) return
    busy.value = true
    try {
      await onConfirm()
      open.value = false
    } catch {
      failed(go)
    } finally {
      busy.value = false
    }
  }
  const submit = (e: Event) => {
    e.preventDefault()
    void go()
  }
  return (
    <>
      {armed.value && (
        <Modal
          open={open}
          alert
          size="sm"
          tone="critical"
          title={title}
          description={description}
          mark={
            <span data-part="mark" data-tone="critical">
              {typeof glyph === 'string' ? <Glyph d={glyph} /> : glyph({})}
            </span>
          }
          footer={
            <>
              <Button emphasis="frame" data-close="">
                Cancel
              </Button>
              <Button tone="critical" disabled={!ok.value} loading={busy.value} onClick={go}>
                {action}
              </Button>
            </>
          }
        >
          <form data-scope="confirm" novalidate onSubmit={submit}>
            {items && (
              <ul>
                {items.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
            <Input
              label={`Type ${confirmText} to confirm`}
              autofocus
              autocomplete="off"
              spellcheck="false"
              value={typed.value}
              onInput={(e) => (typed.value = e.currentTarget.value)}
            />
          </form>
        </Modal>
      )}
    </>
  )
}
