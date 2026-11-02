// The token, for `multiplayer({ ticket })`: signed with the room's identity, so no client can name itself to LiveKit.
import { roomId, signTicket } from '@weft-js/multiplayer/server'

export interface LivekitTicketOptions {
  /** Default `LIVEKIT_API_KEY`. */
  key?: string
  /** Default `LIVEKIT_API_SECRET`. */
  secret?: string
  /** Seconds. Default 3600. */
  ttl?: number
  /** Audio and video too. Default false: data only, which is what cursors need. */
  media?: boolean
}

export const livekitTicket = ({ key = process.env.LIVEKIT_API_KEY, secret = process.env.LIVEKIT_API_SECRET, ttl = 3600, media = false }: LivekitTicketOptions = {}) => async ({ id, user, params }: { id: string; user: { name?: string }; params: unknown }) => {
  if (!key || !secret) throw new Error('`livekitTicket` needs `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`')
  const now = Math.floor(Date.now() / 1000)
  return signTicket({ iss: key, sub: id, name: user.name, nbf: now, exp: now + ttl, video: { room: await roomId(params), roomJoin: true, canPublish: media, canSubscribe: true, canPublishData: true } }, secret)
}
