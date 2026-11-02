import { CheckIcon, FileTextIcon } from '@weft-js/warp-icons'
import { announce, uid } from '@weft-js/warp-core'
import { derived, state, untrack, watch } from '@weft-js/core'
import { Badge } from '../Badge'
import { Button, type Tone } from '../Button'
import { Drawer } from '../Drawer'
import { Mark } from './kit'
import '@weft-js/warp-core/styles/flows/gate.css'
import '@weft-js/warp-core/styles/flows/gate-badge.css'
import '@weft-js/warp-core/styles/flows/pay-frame.css'
import '@weft-js/warp-core/styles/components/spinner.css'

export type SignStatus = 'unsigned' | 'pending' | 'signed' | 'expired' | 'declined' | 'error'

const TONES: Record<SignStatus, Tone> = { unsigned: 'caution', pending: 'caution', signed: 'positive', expired: 'critical', declined: 'critical', error: 'neutral' }
const LABELS: Record<SignStatus, string> = { unsigned: 'Agreement not signed', pending: 'Signature pending', signed: 'Agreement signed', expired: 'Signing link expired', declined: 'Agreement declined', error: "Couldn't check the signature" }
const COPY: Record<SignStatus, string> = {
  unsigned: 'Your legal contact can sign it instead.',
  pending: 'Waiting for the signer to finish. This updates by itself.',
  signed: '',
  expired: 'That link has expired. Send a new one to carry on.',
  declined: 'The agreement was declined. Send it again to carry on.',
  error: "We couldn't reach the signing service. Try again.",
}

/** The gate's status (09 §2.4): caution, positive, critical, neutral. */
export function SignGateBadge({ status }: { status: SignStatus }) {
  const s = derived(() => status)
  return <Badge tone={TONES[s.value]} data-state={s.value}>{s.value === 'signed' ? <CheckIcon /> : <FileTextIcon />}{LABELS[s.value]}</Badge>
}

export interface SignGateProps {
  /** From the provider: `query.live`, a poll, or a signal. */
  status: SignStatus
  /** The provider's embedded signer. */
  src?: string
  title: any
  /** Shown while unsigned. */
  description?: any
  /** The blocker heading's level in the page's outline (the spec's h4 keeps its style). */
  level?: number
  /** The signer frame's accessible name. */
  signerTitle?: string
  onResend?: () => void
  onRetry?: () => void
  /** Once, when status turns signed. */
  onSigned?: () => void
  /** The gated page: rendered, inert behind the blocker until signed. */
  children?: any
}

/**
 * A page behind a signature (09 §2.4). The blocker is a region with a heading, not a dialog: assistive tech reads it as
 * the page, and the page itself is inert. The signer shows while unsigned or pending, inline at 560px on wide screens and
 * in a tall Sheet on a phone (it's chosen when opened, so the server's HTML doesn't guess a width); terminal states
 * have one action. WebAuthn-free: the frame is the provider's.
 */
export function SignGate({ status, src, title, description, signerTitle = 'Signer, provided by the e-signature service', level = 3, onResend, onRetry, onSigned, children }: SignGateProps) {
  const id = uid('gate')
  const s = derived(() => status)
  const signing = state(false)
  const sheet = state(false)
  const inline = derived(() => signing.value && !sheet.value && (s.value === 'unsigned' || s.value === 'pending'))
  const open = () => {
    if (innerWidth < 600) sheet.value = true
    else signing.value = true
  }
  watch(() => s.value, (now, was) => {
    if (was === undefined || now === was) return
    if (now === 'pending') announce(document, 'Signature pending. Checking with the provider.')
    if (now === 'signed') { sheet.value = false; signing.value = false; announce(document, 'Agreement signed.'); onSigned?.() }
    if (now === 'expired' || now === 'declined' || now === 'error') { sheet.value = false; signing.value = false; announce(document, COPY[now], true) }
  })
  return (
    <div data-scope="gate" data-state={s.value}>
      <div data-part="content" inert={s.value === 'signed' ? undefined : true}>{children}</div>
      {s.value !== 'signed' && (
        <section data-part="blocker" aria-labelledby={`${id}-t`}>
          <div data-scope="stack" data-align="center">
            <Mark tone={TONES[s.value] === 'critical' ? 'critical' : 'caution'}><FileTextIcon /></Mark>
            <h4 id={`${id}-t`} aria-level={level}>{title}</h4>
            <p>{s.value === 'unsigned' && description !== undefined ? description : COPY[s.value]}</p>
            {inline.value ? <iframe data-scope="pay-frame" title={signerTitle} src={src} height="560" width="100%"></iframe>
              : s.value === 'pending' ? <span data-scope="spinner" data-part="spinner" aria-hidden="true"></span>
              : s.value === 'unsigned' ? <Button onClick={open}>Review and sign</Button>
              : s.value === 'error' ? <Button onClick={onRetry}>Retry</Button>
              : <Button onClick={onResend}>Resend</Button>}
          </div>
        </section>
      )}
      <Drawer open={sheet} side="bottom" title={untrack(() => title)}>
        {sheet.value && <iframe data-scope="pay-frame" title={signerTitle} src={src} height="560" width="100%"></iframe>}
      </Drawer>
    </div>
  )
}
