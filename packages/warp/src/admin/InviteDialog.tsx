import { adminEmail, inviteProblem } from '@weft-js/warp-core'
import { state, type State, untrack, watch } from '@weft-js/core'
import { Button } from '../Button'
import { Modal } from '../Modal'
import { Select } from '../Select'
import { toast } from '../Toast'
import { afterFlush, latch } from './atoms'
import { TagsInput } from './TagsInput'
import '../styles'
import '@weft-js/warp-core/styles/flows/tokens.css'
import '@weft-js/warp-core/styles/flows/base.css'
import '@weft-js/warp-core/styles/rich/helpers.css'
import '@weft-js/warp-core/styles/layout/tokens.css'
import '@weft-js/warp-core/styles/layout/row.css'
import '@weft-js/warp-core/styles/layout/stack.css'

/** Props for InviteDialog. */
export interface InviteDialogProps {
  open: State<boolean>
  roles: { value: string; label: string }[]
  defaultRole?: string
  /** Pending invites use a seat; the check runs before anything is sent. */
  seatsLeft: number
  /** Send them; a thrown error keeps the dialog and its tags. */
  onSend: (emails: string[], role: string) => Promise<void> | void
}

/** Invite (09 §4.2): a multi-email tags field and a role, checked against the seats left before sending. */
export function InviteDialog({ open, roles, defaultRole, seatsLeft, onSend }: InviteDialogProps) {
  const armed = latch(untrack(() => open))
  const emails = state<string[]>([])
  const role = state(untrack(() => defaultRole ?? roles[0]?.value ?? ''))
  const error = state('')
  const busy = state(false)
  let root: HTMLElement | undefined
  watch(() => open.value, on => { if (on) { emails.value = []; error.value = '' } })
  const send = async () => {
    if (busy.value) return
    const typed = root?.querySelector<HTMLInputElement>('input[data-part="input"]')
    typed?.blur()
    const problem = inviteProblem(emails.value, seatsLeft)
    if (problem) { error.value = problem; afterFlush(() => typed?.focus()); return }
    busy.value = true
    try {
      await onSend(emails.value, role.value)
      open.value = false
      toast.show({ title: emails.value.length === 1 ? 'Invite sent' : `${emails.value.length} invites sent`, description: emails.value.join(', '), tone: 'positive' })
    } catch {
      toast.show({ title: 'The invites didn’t send', description: 'Your list is still here.', tone: 'critical', action: { label: 'Retry', onClick: send } })
    } finally { busy.value = false }
  }
  return (
    <>
      {armed.value && (
        <Modal open={open} title="Invite people" description="They get an email with a link that works for 7 days." footer={<><Button emphasis="frame" data-close="">Cancel</Button><Button loading={busy.value} onClick={send}>Send invites</Button></>}>
          <form ref={n => (root = n)} data-scope="stack" style="padding-block-start:var(--warp-space-related)" novalidate onSubmit={(e: Event) => e.preventDefault()}>
            <TagsInput label="Email addresses" autofocus hint="Enter or comma adds one. Paste a list to add many." error={error.value} value={emails} valid={adminEmail} onEdit={() => (error.value = '')} onSubmit={send} />
            <Select label="Role" options={roles} value={role.value} onChange={(e: Event) => (role.value = (e.currentTarget as HTMLInputElement).value)} />
          </form>
        </Modal>
      )}
    </>
  )
}
