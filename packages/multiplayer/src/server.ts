// The server's half (research 35 §2): messages a `channel` spreads into its own definition, so the compiler still sees a
// plain `channel({ … })` and `authorize` stays the app's.
//
//   const mp = multiplayer({ user: ({ ctx }) => ({ id: ctx.user!.id, name: ctx.user!.name }) })
//   export const doc = channel({
//     params, authorize,
//     client: { ...mp.client, say }, server: { ...mp.server, said }, on: { ...mp.on, say: … }, left: mp.left,
//   })
//
// Who a peer is comes from `user`, never from the client: a connection names only its own state and cursor, and every
// frame is stamped here with the connection that sent it (agorix M3, C3). There's no roster on the server: each client
// answers an `ask`, peers expire without a beat, so any bus works and a dead instance's peers just age out.

import { StartError } from '@weft/start/data'
import type { Context, StandardSchemaV1 } from '@weft/start'

export interface PeerUser { id: string; name?: string; [key: string]: unknown }
export interface Peer<S = unknown> { id: string; user: PeerUser; state: S; at: number }
export interface CursorAt { a?: string; x: number; y: number; style?: string }

type Issue = { issues: { message: string }[] }
const schema = <T,>(validate: (v: any) => T | Issue): StandardSchemaV1<T, T> => ({ '~standard': { version: 1, vendor: 'weft', validate: (v: unknown) => { const r: any = validate(v); return r?.issues ? r : { value: r } } } }) as any
const no = (message: string): Issue => ({ issues: [{ message }] })
const within = (v: unknown, bytes: number) => { try { return (JSON.stringify(v) ?? '').length <= bytes } catch { return false } }
const unit = (n: unknown) => typeof n === 'number' && n >= -0.5 && n <= 1.5

const STATE = 4096, RELAY = 2048, SIGNAL = 16_384

const anything = schema(v => v)

const stateful = (max: number) => schema(v => (v && typeof v === 'object' && within(v.state, max) ? { state: v.state } : no(`\`state\` is JSON up to ${max} bytes`)))

export const cursorSchema = schema<CursorAt | null>(v => {
  if (v === null) return null
  if (!v || !unit(v.x) || !unit(v.y)) return no('a cursor is `{ x, y }` in fractions')
  if (v.a !== undefined && (typeof v.a !== 'string' || v.a.length > 128)) return no('an anchor is up to 128 characters')
  if (v.style !== undefined && (typeof v.style !== 'string' || v.style.length > 16)) return no('a style is up to 16 characters')
  return { x: v.x, y: v.y, ...(v.a === undefined ? {} : { a: v.a }), ...(v.style === undefined ? {} : { style: v.style }) }
})

const answerSchema = schema(v => (v && typeof v.to === 'string' && within(v.state, STATE) ? { to: v.to, state: v.state } : no('an answer names who asked')))
const signalSchema = schema(v => (v && typeof v.to === 'string' && within(v.data, SIGNAL) ? { to: v.to, data: v.data } : no(`a signal names a peer, with up to ${SIGNAL} bytes`)))

export interface TicketArgs<P> { id: string; user: PeerUser; params: P; ctx: Context }

export interface MultiplayerOptions<P> {
  /** Who this connection is. Required: a peer can't name itself. */
  user: (args: { ctx: Context; params: P; id: string }) => PeerUser | Promise<PeerUser>
  /** The relay's event kinds and what each may carry. Nothing else is relayed. */
  relay?: Record<string, StandardSchemaV1>
  /** A transport's credential, handed to the client with its id. `livekitTicket`, `socketioTicket`. */
  ticket?: (args: TicketArgs<P>) => unknown
  /** Bytes one peer's `state` may be. Default 4096. */
  state?: number
}

/** `client`, `server`, `on` and `left` to spread into a `channel`. Every message is `mp.*`, and all but `mp.relay` are volatile. */
export function multiplayer<P = any>(options: MultiplayerOptions<P>) {
  const { user, relay = {}, ticket, state = STATE } = options
  const people = new Map<string, PeerUser>()
  const who = async (args: { ctx: Context; params: P; id: string }) => {
    const known = people.get(args.id)
    if (known) return known
    const made = await user(args)
    if (!made || typeof made.id !== 'string') throw new Error('`user` must return an object with an `id`')
    people.set(args.id, made)
    return made
  }
  const peer = async (a: { id: string; ctx: Context; params: P }, value: unknown) => ({ id: a.id, user: await who(a), state: value, at: Date.now() })
  const volatile = { volatile: true }
  const relaySchema = schema(v => {
    if (!v || typeof v.kind !== 'string' || !Object.hasOwn(relay, v.kind) || !within(v.data, RELAY)) return no('that relay kind is not declared')
    return { kind: v.kind, data: v.data }
  })
  return {
    client: {
      'mp.hello': stateful(state),
      'mp.state': stateful(state),
      'mp.answer': answerSchema,
      'mp.cursor': cursorSchema,
      'mp.relay': relaySchema,
      'mp.signal': signalSchema,
    },
    server: {
      'mp.you': anything,
      'mp.peer': anything,
      'mp.gone': anything,
      'mp.ask': anything,
      'mp.cursor': anything,
      'mp.relay': anything,
      'mp.signal': anything,
    },
    on: {
      /** A connection arrives, or comes back: it learns its id and everyone hears it. */
      'mp.hello': async ({ msg, id, ctx, params, room }: any) => {
        const me = await peer({ id, ctx, params }, msg.state)
        await room.publish('mp.you', { id, ticket: await ticket?.({ id, user: me.user, params, ctx }) }, { to: id, volatile: true })
        await room.publish('mp.peer', me, { ...volatile, exceptSelf: true })
        await room.publish('mp.ask', { id }, { ...volatile, exceptSelf: true })
      },
      'mp.state': async ({ msg, id, ctx, params, room }: any) => room.publish('mp.peer', await peer({ id, ctx, params }, msg.state), { ...volatile, exceptSelf: true }),
      'mp.answer': async ({ msg, id, ctx, params, room }: any) => room.publish('mp.peer', await peer({ id, ctx, params }, msg.state), { ...volatile, to: msg.to }),
      'mp.cursor': ({ msg, id, room }: any) => room.publish('mp.cursor', { id, at: msg }, { ...volatile, exceptSelf: true }),
      'mp.relay': async ({ msg, id, room }: any) => {
        const r = await relay[msg.kind]['~standard'].validate(msg.data)
        if (r.issues) throw new StartError('Q002', `\`${msg.kind}\` refused its data`)
        await room.publish('mp.relay', { id, kind: msg.kind, data: r.value }, { exceptSelf: true })
      },
      'mp.signal': ({ msg, id, room }: any) => room.publish('mp.signal', { from: id, data: msg.data }, { ...volatile, to: msg.to }),
    },
    left: async ({ id, room }: any) => {
      people.delete(id)
      await room.publish('mp.gone', { id }, volatile)
    },
  }
}

// ---- tickets --------------------------------------------------------------------------------------------------------

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const hmac = (secret: string) => crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])

/** An HS256 JWT, which is what LiveKit reads and what a relay can check with one shared secret. */
export async function signTicket(claims: Record<string, unknown>, secret: string): Promise<string> {
  const text = (v: unknown) => b64(new TextEncoder().encode(JSON.stringify(v)))
  const body = `${text({ alg: 'HS256', typ: 'JWT' })}.${text(claims)}`
  return `${body}.${b64(new Uint8Array(await crypto.subtle.sign('HMAC', await hmac(secret), new TextEncoder().encode(body))))}`
}

/** The claims, or null: a bad signature, another algorithm, or past `exp`. */
export async function verifyTicket(ticket: string, secret: string): Promise<Record<string, any> | null> {
  const [head, body, sig] = String(ticket).split('.')
  if (!sig) return null
  const bytes = (s: string) => Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0))
  try {
    if (JSON.parse(new TextDecoder().decode(bytes(head))).alg !== 'HS256') return null
    if (!(await crypto.subtle.verify('HMAC', await hmac(secret), bytes(sig), new TextEncoder().encode(`${head}.${body}`)))) return null
    const claims = JSON.parse(new TextDecoder().decode(bytes(body)))
    return typeof claims.exp === 'number' && claims.exp * 1000 > Date.now() ? claims : null
  } catch {
    return null
  }
}

/** A name for a room a third party can hold: stable, and it says nothing of the params. */
export async function roomId(params: unknown): Promise<string> {
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(params ?? null))))).slice(0, 32)
}
