import { cursorsLayer, firstName, peerColor, type CursorPeer, type Peer } from '@weft-js/warp-core'
import { derived } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'
import { read, type Live } from './peer'
import '../styles'
import '@weft-js/warp-core/styles/app/tokens.css'
import '@weft-js/warp-core/styles/app/base.css'
import '@weft-js/warp-core/styles/app/cursors.css'
import '@weft-js/warp-core/styles/app/cursor.css'

/**
 * Peer cursors (07 §6.1): arrow and name chip in the peer's colour, anchored to `[data-anchor]` elements in the
 * positioned parent. Glide 120 ms, fade after `idle` ms, an edge chevron when the anchor is off-screen. aria-hidden.
 */
export function Cursors({ peers, anchor, idle = 5000 }: { peers: Live<CursorPeer[]>; anchor?: string | undefined; idle?: number }) {
  const list = derived(() => read(peers))
  let layer: HTMLDivElement | undefined
  use(cursorsLayer, () => layer, () => ({ peers: list.value, anchor, idle }))
  return (
    <div ref={n => (layer = n)} data-scope="cursors" aria-hidden="true">
      {list.value.map(p => (
        <div key={p.id} data-scope="cursor" data-presence-color={peerColor(p)} data-peer={p.id} style="--_x:0px;--_y:0px">
          <svg viewBox="0 0 16 16"><path d="M1 1l5.5 13 2-5.5L14 6.5z" /></svg>
          <span><b>{firstName(p.name)}</b></span>
        </div>
      ))}
    </div>
  )
}

/** A peer's selected text (07 §6.1): a tint in their colour and a caret on the focus end. Decorative. */
export const PeerMark = ({ peer, children }: { peer: Peer; children?: unknown }) => <mark data-peer-text="" data-presence-color={peerColor(peer)}>{children}</mark>

/** A peer's selection on an object: an outline with their name flag. */
export const PeerSelection = ({ peer, children }: { peer: Peer; children?: unknown }) => <span data-peer-selection={firstName(peer.name)} data-presence-color={peerColor(peer)}>{children}</span>
