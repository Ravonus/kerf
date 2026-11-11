// What the collab pack shares: a peer's avatar in their presence colour, and the props that may be a State or a value.
import { peerColor, type Peer } from '@kerf-js/veneer-core'
import { Box } from '@kerf-js/core/internal'
import { type State } from '@kerf-js/core'
import { Avatar } from '../parts'

export type Live<T> = State<T> | T
export const read = <T,>(v: Live<T>): T => (v instanceof Box ? v.value : (v as T))

export const tint = (n: number) =>
  `--_bg:color-mix(in oklab,var(--veneer-color-data-${n}) 26%,var(--veneer-color-surface-raised))`

/** A peer's Avatar: the tint and, with `ring`, the presence colour ring. */
export function PeerAvatar({
  peer,
  size,
  ring,
  ...rest
}: {
  peer: Peer
  size?: 'sm' | 'md' | 'lg' | undefined
  ring?: boolean
  [attr: string]: unknown
}) {
  return (
    <Avatar
      name={peer.name}
      size={size}
      presence={ring ? peerColor(peer) : undefined}
      data-presence-color={peerColor(peer)}
      style={tint(peerColor(peer))}
      {...rest}
    />
  )
}

export const SWEEP = () => (
  <>
    <span data-part="sweep-base" aria-hidden="true"></span>
    <span data-part="sweep" aria-hidden="true"></span>
  </>
)
