// What the collab pack shares: a peer's avatar in their presence colour, and the props that may be a State or a value.
import { peerColor, type Peer } from '@weft/warp-core'
import { Box, type State } from 'weft'
import { Avatar } from '../parts'

export type Live<T> = State<T> | T
export const read = <T,>(v: Live<T>): T => (v instanceof Box ? v.value : (v as T))

export const tint = (n: number) => `--_bg:color-mix(in oklab,var(--warp-color-data-${n}) 26%,var(--warp-color-surface-raised))`

/** A peer's Avatar: the tint and, with `ring`, the presence colour ring. */
export function PeerAvatar({ peer, size, ring, ...rest }: { peer: Peer; size?: 'sm' | 'md' | 'lg'; ring?: boolean; [attr: string]: any }) {
  return <Avatar name={peer.name} size={size} presence={ring ? peerColor(peer) : undefined} data-presence-color={peerColor(peer)} style={tint(peerColor(peer))} {...rest} />
}

export const SWEEP = () => <><span data-part="sweep-base" aria-hidden="true"></span><span data-part="sweep" aria-hidden="true"></span></>
