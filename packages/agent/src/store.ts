// Where conversations, usage, held calls and tokens live. `drizzleAgentStore` puts them in the app's database; write
// these methods for any other. `memoryAgentStore` is for dev and tests, and a production server refuses it (AGENT010).
import type { AgentToken, Conversation, Message, PendingCall, Usage } from './index'

/** A token's row: its grants and the hash of its secret. The secret itself is shown once and never stored. */
export interface TokenRow extends AgentToken {
  hash: string
}

/** Where conversations, usage, held calls and tokens are kept. */
export interface AgentStore {
  readonly memory?: boolean
  conversations(owner: string, state: Conversation['state']): Promise<Conversation[]>
  conversation(id: string): Promise<Conversation | null>
  saveConversation(c: Conversation): Promise<void>
  /** The conversation, its messages and its held calls. */
  removeConversation(id: string): Promise<void>
  messages(conversation: string): Promise<Message[]>
  addMessage(m: Message): Promise<void>
  addUsage(u: Usage): Promise<void>
  /** Usage since `since` (ms), for one owner's conversations and tokens. */
  usage(owner: string, since: number): Promise<Usage[]>
  pending(conversation: string): Promise<PendingCall[]>
  hold(p: PendingCall): Promise<void>
  /** Takes it off the list: whoever takes it runs or declines it, once. */
  take(id: string): Promise<PendingCall | null>
  tokens(owner: string): Promise<AgentToken[]>
  token(id: string): Promise<TokenRow | null>
  tokenByHash(hash: string): Promise<TokenRow | null>
  saveToken(t: TokenRow): Promise<void>
}

const ok = <T>(v: T) => Promise.resolve(v)
/** Settled with nothing, whatever the map call returned. */
const done = (_?: unknown) => Promise.resolve()

/** Everything in maps: lost on restart. `clear` empties it. */
export function memoryAgentStore(): AgentStore & { clear(): void } {
  const conversations = new Map<string, Conversation>()
  const messages = new Map<string, Message[]>()
  const usage: Usage[] = []
  const held = new Map<string, PendingCall>()
  const tokens = new Map<string, TokenRow>()
  const owned = (owner: string) =>
    new Set([...conversations.values()].filter((c) => c.owner === owner).map((c) => c.id))
  return {
    memory: true,
    clear() {
      conversations.clear()
      messages.clear()
      usage.length = 0
      held.clear()
      tokens.clear()
    },
    conversations: (owner, state) =>
      ok(
        [...conversations.values()]
          .filter((c) => c.owner === owner && c.state === state)
          .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated - a.updated),
      ),
    conversation: (id) => ok(conversations.get(id) ?? null),
    saveConversation: (c) => done(conversations.set(c.id, { ...c })),
    removeConversation(id) {
      conversations.delete(id)
      messages.delete(id)
      for (const [k, p] of held) if (p.conversation === id) held.delete(k)
      return done()
    },
    messages: (conversation) => ok([...(messages.get(conversation) ?? [])]),
    addMessage: (m) =>
      done(messages.set(m.conversation, [...(messages.get(m.conversation) ?? []), m])),
    addUsage: (u) => done(usage.push(u)),
    usage(owner, since) {
      const mine = owned(owner)
      const theirs = new Set([...tokens.values()].filter((t) => t.owner === owner).map((t) => t.id))
      return ok(
        usage.filter(
          (u) =>
            u.at >= since &&
            ((u.conversation !== null && mine.has(u.conversation)) ||
              (u.token !== null && theirs.has(u.token))),
        ),
      )
    },
    pending: (conversation) =>
      ok([...held.values()].filter((p) => p.conversation === conversation)),
    hold: (p) => done(held.set(p.id, p)),
    take(id) {
      const p = held.get(id) ?? null
      held.delete(id)
      return ok(p)
    },
    tokens: (owner) =>
      ok(
        [...tokens.values()]
          .filter((t) => t.owner === owner)
          .map(({ hash: _, ...t }) => t)
          .sort((a, b) => b.created - a.created),
      ),
    token: (id) => ok(tokens.get(id) ?? null),
    tokenByHash: (hash) => ok([...tokens.values()].find((t) => t.hash === hash) ?? null),
    saveToken: (t) => done(tokens.set(t.id, { ...t })),
  }
}
