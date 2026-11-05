import type { CursorPeer, ViewportPeer } from '@weft-js/warp'
import { JUN, LENA, SAM } from './peers'

export const CURSOR_PEERS: CursorPeer[] = [
  { ...JUN, cursor: { anchor: 'title', x: 0.42, y: 0.8 } },
  { ...LENA, cursor: { anchor: 'body', x: 0.7, y: 0.35 } },
  { ...SAM, cursor: { anchor: 'body', x: 0.22, y: 0.85 } },
]

export const VIEWPORT_PEERS: ViewportPeer[] = [
  { ...JUN, top: 0.12, height: 0.3 },
  { ...LENA, top: 0.55, height: 0.3 },
]
