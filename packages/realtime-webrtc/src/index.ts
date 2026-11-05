// Cursors over WebRTC data channels: a full mesh, with offers and candidates through the room, so `from` on a frame is
// the peer the server vouched for when the connection was made. Unordered and without retries, like what it carries. A
// page without a working path to a peer stays on the socket: `up` is true only when every peer is connected.
//
//   presence(chat, { transport: webrtc({ iceServers: [{ urls: 'stun:stun.example.com' }] }) })

import { createRoot, derived, effect, state, untrack } from '@weft-js/core'
import type { PeerLink, PeerRoom, PeerTransport } from '@weft-js/multiplayer'

/** Options of `webrtc()`. */
export interface WebRtcOptions {
  /** STUN and TURN. Default none: peers on one network. */
  iceServers?: RTCIceServer[]
  /** More peers than this and it stays on the socket: a mesh costs each peer one connection per other. Default 8. */
  max?: number
}

interface Conn {
  pc: RTCPeerConnection
  dc?: RTCDataChannel
  makingOffer: boolean
}
interface Signal {
  description?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

function connections(
  room: PeerRoom,
  iceServers: RTCIceServer[],
  conns: Map<string, Conn>,
  open: { value: number },
) {
  const channel = (id: string, c: Conn, dc: RTCDataChannel) => {
    c.dc = dc
    dc.onopen = () => {
      open.value++
    }
    dc.onclose = () => {
      open.value++
    }
    dc.onmessage = (e) => {
      if (typeof e.data === 'string' && e.data.length < 1024) room.receive(id, e.data)
    }
  }
  const connect = (id: string) => {
    const had = conns.get(id)
    if (had) return had
    const c: Conn = { pc: new RTCPeerConnection({ iceServers }), makingOffer: false }
    conns.set(id, c)
    c.pc.onicecandidate = (e) => {
      if (e.candidate) room.signal(id, { candidate: e.candidate.toJSON() })
    }
    c.pc.onconnectionstatechange = () => {
      open.value++
    }
    c.pc.ondatachannel = (e) => channel(id, c, e.channel)
    c.pc.onnegotiationneeded = async () => {
      try {
        c.makingOffer = true
        await c.pc.setLocalDescription()
        room.signal(id, { description: c.pc.localDescription!.toJSON() })
      } catch {
        // The other side's offer won: its handler takes over.
      } finally {
        c.makingOffer = false
      }
    }
    return c
  }
  return { channel, connect }
}

function signalHandler(room: PeerRoom, connect: (id: string) => Conn) {
  return async (from: string, data: unknown) => {
    if (!untrack(() => room.peers.value).includes(from) || typeof data !== 'object' || !data) return
    const { description, candidate } = data as Signal
    const c = connect(from)
    try {
      if (description) {
        // Perfect negotiation: the lower id gives way when both offer at once.
        const collision =
          description.type === 'offer' && (c.makingOffer || c.pc.signalingState !== 'stable')
        if (collision && room.self > from) return
        await c.pc.setRemoteDescription(description)
        if (description.type === 'offer') {
          await c.pc.setLocalDescription()
          room.signal(from, { description: c.pc.localDescription!.toJSON() })
        }
      } else if (candidate) await c.pc.addIceCandidate(candidate).catch(() => {})
    } catch {
      // A bad frame from a peer costs that peer its link: frames for it stay on the socket.
    }
  }
}

/** A peer transport over a mesh of WebRTC data channels, for `presence(conn, { transport })`. */
export function webrtc({ iceServers = [], max = 8 }: WebRtcOptions = {}): PeerTransport {
  return {
    name: 'webrtc',
    open(room: PeerRoom): PeerLink {
      return createRoot((dispose) => {
        const conns = new Map<string, Conn>()
        const open = state(0)
        const { channel, connect } = connections(room, iceServers, conns, open)
        const answer = signalHandler(room, connect)
        const stop = room.onSignal((from, data) => void answer(from, data))
        const close = (id: string) => {
          conns.get(id)?.pc.close()
          conns.delete(id)
          open.value++
        }
        effect(
          () => room.peers.value,
          (ids) => {
            if (ids.length > max) return
            for (const id of ids) {
              if (conns.has(id)) continue
              const c = connect(id)
              if (room.self < id)
                channel(
                  id,
                  c,
                  c.pc.createDataChannel('weft', { ordered: false, maxRetransmits: 0 }),
                )
            }
            for (const id of conns.keys()) if (!ids.includes(id)) close(id)
          },
        )
        const up = derived(() => {
          void open.value
          const ids = room.peers.value
          return (
            ids.length > 0 &&
            ids.length <= max &&
            ids.every((id) => conns.get(id)?.dc?.readyState === 'open')
          )
        })
        return {
          up,
          send(text) {
            for (const c of conns.values()) if (c.dc?.readyState === 'open') c.dc.send(text)
          },
          close() {
            stop()
            for (const id of conns.keys()) close(id)
            dispose()
          },
        }
      })
    },
  }
}
