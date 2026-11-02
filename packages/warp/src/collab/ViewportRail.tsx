import { firstName, joinNames, peerColor, type Peer } from '@weft-js/warp-core'
import { derived } from '@weft-js/core'
import { PeerAvatar, read, type Live } from './peer'
import '../styles'
import '@weft-js/warp-core/styles/app/tokens.css'
import '@weft-js/warp-core/styles/app/base.css'
import '@weft-js/warp-core/styles/app/avatar.css'
import '@weft-js/warp-core/styles/app/viewport-rail.css'
import '@weft-js/warp-core/styles/app/section-peers.css'

export type ViewportPeer = Peer & { /** Viewport top and height, 0–1 of the document. */ top: number; height: number }

/**
 * LiveViewport (07 §6.1): a rail of the document with a box per viewport in the peer's colour. A picture, unless
 * `onJump` makes each box a button.
 */
export function ViewportRail({ peers, self, onJump, label = 'Where people are looking' }: { peers: Live<ViewportPeer[]>; self?: { top: number; height: number }; onJump?: (p: ViewportPeer) => void; label?: string }) {
  const list = derived(() => read(peers))
  const canJump = derived(() => onJump !== undefined)
  return (
    <div data-scope="viewport-rail" role={canJump.value ? 'group' : 'img'} aria-label={label}>
      {self && <i data-self="" style={`--_t:${self.top};--_h:${self.height}`}></i>}
      {list.value.map(p => (
        <i
          key={p.id}
          data-presence-color={peerColor(p)}
          style={`--_t:${p.top};--_h:${p.height}`}
          role={canJump.value ? 'button' : undefined}
          tabindex={canJump.value ? 0 : undefined}
          aria-label={canJump.value ? `Jump to ${p.name}` : undefined}
          onClick={() => onJump?.(p)}
          onKeyDown={(e: KeyboardEvent) => { if (canJump.value && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onJump?.(p) } }}
        ></i>
      ))}
    </div>
  )
}

/** LiveSection (07 §6.1): who is reading this section, beside its heading. */
export function SectionPeers({ peers }: { peers: Live<Peer[]> }) {
  const list = derived(() => read(peers))
  const names = derived(() => list.value.map(p => firstName(p.name)))
  return (
    <span data-scope="section-peers" role="img" aria-label={`${joinNames(names.value)} ${names.value.length === 1 ? 'is' : 'are'} here`}>
      {list.value.map(p => <PeerAvatar key={p.id} peer={p} />)}
    </span>
  )
}
