// Peer identity and palette.
/** Someone present in a shared room. */
export interface Peer {
  id: string
  name: string
  /** Presence colour, data palette 1–8; stable per peer when left out. */ color?: number
}

/** A stable slot in the data palette (1–8) for a peer id. */
export function peerColor(p: { id: string; color?: number }) {
  if (p.color) return p.color
  let h = 0
  for (let i = 0; i < p.id.length; i++) h = (h * 31 + p.id.charCodeAt(i)) >>> 0
  return (h % 8) + 1
}
