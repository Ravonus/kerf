import { firstName, peerColor, uid, type Peer } from '@weft/ui-core'
import { untrack } from 'weft'
import { Input } from '../Field'
import { PeerAvatar } from './peer'
import '../styles'
import '@weft/ui-core/styles/app/tokens.css'
import '@weft/ui-core/styles/app/base.css'
import '@weft/ui-core/styles/app/lock.css'

/** The chip on a field another peer holds (07 §6.1): "Kofi is editing". */
export function LockIndicator({ peer, ...rest }: { peer: Peer; [attr: string]: any }) {
  return <span data-scope="lock" data-presence-color={peerColor(peer)} {...rest}><PeerAvatar peer={peer} />{firstName(peer.name)} is editing</span>
}

/** A text field held by a peer: `readonly`, not disabled, so it stays readable and focusable; the chip describes it. */
export function LockedField({ peer, ...field }: { peer: Peer | null; label: string; value?: string; [attr: string]: any }) {
  const id = uid('lock')
  const props = untrack(() => field)
  return (
    <div data-locked-by={peer?.id}>
      <Input {...props} readonly={peer !== null} aria-describedby={peer ? id : undefined} />
      {peer && <LockIndicator peer={peer} id={id} />}
    </div>
  )
}
