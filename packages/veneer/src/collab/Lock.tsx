import { firstName, peerColor, uid, type Peer } from '@kerf/veneer-core'
import { Input } from '../Field'
import { PeerAvatar } from './peer'
import '../styles'
import '@kerf/veneer-core/styles/app/tokens.css'
import '@kerf/veneer-core/styles/app/base.css'
import '@kerf/veneer-core/styles/app/lock.css'

/** The chip on a field another peer holds (07 §6.1): "Kofi is editing". */
export function LockIndicator({ peer, ...rest }: { peer: Peer; [attr: string]: unknown }) {
  return (
    <span data-scope="lock" data-presence-color={peerColor(peer)} {...rest}>
      <PeerAvatar peer={peer} />
      {firstName(peer.name)} is editing
    </span>
  )
}

/** A text field held by a peer: `readonly`, not disabled, so it stays readable and focusable; the chip describes it. */
export function LockedField({
  peer,
  ...field
}: {
  peer: Peer | null
  label: string
  value?: string
  [attr: string]: unknown
}) {
  const id = uid('lock')
  return (
    <div data-locked-by={peer?.id}>
      <Input {...field} readonly={peer !== null} aria-describedby={peer ? id : undefined} />
      {peer && <LockIndicator peer={peer} id={id} />}
    </div>
  )
}
