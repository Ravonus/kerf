import { announce, burst, firstName, followViewport, peerColor, popover, presenceDelta, uid, type Peer } from '@weft-js/warp-core'
import { derived, onCleanup, onMount, state, untrack, watch } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'
import { PeerAvatar, read, type Live } from './peer'
import '../styles'
import '@weft-js/warp-core/styles/components/popover.css'
import '@weft-js/warp-core/styles/app/tokens.css'
import '@weft-js/warp-core/styles/app/base.css'
import '@weft-js/warp-core/styles/app/avatar-stack.css'
import '@weft-js/warp-core/styles/app/follow-flag.css'

/**
 * Who is here (07 §6.1): avatars with a ring in each peer's colour, `+n` overflow opening the list, joins and leaves
 * announced as one summary. With `onFollow` each avatar is a toggle: `following` is the peer's id.
 */
export function PresenceStack({ peers, max = 4, following, onFollow, label = 'People here' }: { peers: Live<Peer[]>; max?: number | undefined; following?: string | null | undefined; onFollow?: (p: Peer | null) => void; label?: string | undefined }) {
  const id = uid('presence')
  const list = derived(() => read(peers))
  const front = derived(() => list.value.slice(0, max))
  const rest = derived(() => list.value.slice(max))
  const open = state(false)
  const canFollow = derived(() => onFollow !== undefined)
  let more: HTMLButtonElement | undefined
  let panel: HTMLDivElement | undefined
  use(popover, () => panel, () => ({ open: open.value, trigger: more!, onClose: () => (open.value = false) }))
  onMount(() => {
    const told = burst<string>(lines => announce(panel!.ownerDocument, lines.join('. ')))
    let was = untrack(() => list.value)
    onCleanup(told.cancel)
    watch(() => list.value, now => {
      const line = presenceDelta(was, now)
      was = now
      if (line) told.push(line)
    })
  })
  return (
    <span data-scope="avatar-stack" role="group" aria-label={label}>
      {front.value.map(p => (canFollow.value
        ? <button key={p.id} type="button" data-hit="" aria-pressed={following === p.id ? 'true' : 'false'} title={`Follow ${p.name}`} style="all:unset;cursor:pointer;border-radius:99px" onClick={() => onFollow!(following === p.id ? null : p)}><span data-part="sr-only">Follow {p.name}</span><PeerAvatar peer={p} size="sm" ring /></button>
        : <PeerAvatar key={p.id} peer={p} size="sm" ring />))}
      {rest.value.length > 0 && <button ref={n => (more = n)} type="button" data-part="more" aria-haspopup="dialog" aria-expanded={open.value ? 'true' : 'false'} aria-controls={id} aria-label={`${rest.value.length} more people`} style="border:0;margin-inline-start:0;cursor:pointer" onClick={() => (open.value = !open.value)}>+{rest.value.length}</button>}
      <div ref={n => (panel = n)} data-scope="popover" data-part="content" role="dialog" popover="manual" id={id} aria-label={label}>
        <ul>{list.value.map(p => <li key={p.id}>{p.name}</li>)}</ul>
      </div>
    </span>
  )
}

/**
 * Following (07 §6.1): wraps the surface that rides the peer's viewport. The frame and the flag take their colour; any
 * scroll of the user's, or Esc, stops. `top` is the peer's viewport top, 0–1.
 */
export function Following({ peer, top, onStop, children, ...rest }: { peer: Peer | null; top?: number | undefined; onStop: () => void; children?: unknown; [attr: string]: unknown }) {
  let el: HTMLDivElement | undefined
  const on = derived(() => peer !== null)
  onMount(() => watch(() => peer, (p, was) => {
    if (p) announce(el!.ownerDocument, `Following ${p.name}`)
    else if (was) announce(el!.ownerDocument, 'Stopped following')
  }))
  use(followViewport, () => el, () => ({ on: on.value, top, onStop }))
  return (
    <div ref={n => (el = n)} data-following={on.value ? '' : undefined} data-presence-color={peer ? peerColor(peer) : undefined} style="position:relative" {...rest}>
      {peer && <span data-scope="follow-flag" data-presence-color={peerColor(peer)}>Following {firstName(peer.name)} · Esc to stop</span>}
      {children}
    </div>
  )
}
