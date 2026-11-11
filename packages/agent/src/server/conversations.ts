// A person's conversations: listed, opened, started, renamed, pinned, archived, deleted, and the two things that move
// one on, saying something and answering a held call.
import { randomUUID } from 'node:crypto'
import type { Context } from '@kerf/start'
import { allows, type Conversation, type TurnEvent } from '../index'
import { allTools } from '../tools'
import { AgentError, userOf, type Core } from './core'
import { runTool, turn } from './run'

type Change = { title?: string; state?: Conversation['state']; pinned?: boolean; bridge?: string }
const quiet = () => {}
const never = () => new AbortController().signal

/** The conversation methods of a `defineAgent` result. */
export function conversationApi(core: Core) {
  const { store } = core
  return {
    conversations: (ctx: Context, state: Conversation['state'] = 'open') =>
      store.conversations(userOf(ctx).id, state),

    async conversation(ctx: Context, id: string) {
      const c = await core.mine(ctx, id)
      return { ...c, messages: await store.messages(id), pending: await store.pending(id) }
    },

    async start(ctx: Context, input: { title?: string; bridge?: string } = {}) {
      const now = Date.now()
      const c: Conversation = {
        id: randomUUID(),
        title: input.title?.trim() || 'New conversation',
        owner: userOf(ctx).id,
        state: 'open',
        pinned: false,
        bridge: core.bridge(input.bridge)?.id ?? 'none',
        created: now,
        updated: now,
      }
      await store.saveConversation(c)
      return c
    },

    async update(ctx: Context, id: string, change: Change) {
      const c = await core.mine(ctx, id)
      const next = {
        ...c,
        ...(change.title !== undefined && { title: change.title.trim() || c.title }),
        ...(change.state && { state: change.state }),
        ...(change.pinned !== undefined && { pinned: change.pinned }),
        ...(change.bridge &&
          core.bridge(change.bridge)?.id === change.bridge && { bridge: change.bridge }),
        updated: Date.now(),
      }
      await store.saveConversation(next)
      return next
    },

    async remove(ctx: Context, id: string) {
      await core.mine(ctx, id)
      await store.removeConversation(id)
    },
  }
}

/** Saying something and answering a held call: the methods that run turns. */
export function turnApi(core: Core) {
  const { store } = core
  return {
    /**
     * Say something and run the turn. `emit` gets the reply as it's written (publish it to a topic for the page). The
     * first message titles a new conversation.
     */
    async send(
      ctx: Context,
      input: { conversation: string; text: string },
      emit: (e: TurnEvent) => void = quiet,
      signal = never(),
    ) {
      let c = await core.mine(ctx, input.conversation)
      const text = input.text.trim()
      if (!text) throw new AgentError('AGENT004', 'Say something first', 422)
      if (c.state === 'archived') c = { ...c, state: 'open' }
      if (c.title === 'New conversation')
        c = { ...c, title: text.length > 60 ? `${text.slice(0, 57)}…` : text }
      await store.saveConversation(c)
      await store.addMessage({
        id: randomUUID(),
        conversation: c.id,
        role: 'user',
        parts: [{ type: 'text', text }],
        at: Date.now(),
      })
      try {
        return await turn(core, ctx, c, emit, signal)
      } catch (e) {
        emit({ type: 'error', message: e instanceof Error ? e.message : String(e) })
        throw e
      }
    },

    /** The owner's answer to a held call: run it (or not), then let the agent go on from there. */
    async resolve(
      ctx: Context,
      input: { call: string; approve: boolean },
      emit: (e: TurnEvent) => void = quiet,
      signal = never(),
    ) {
      const held = await store.take(input.call)
      if (!held) throw new AgentError('AGENT005', 'That was already answered', 409)
      const c = await core.mine(ctx, held.conversation)
      const grants = core.grantsOf(userOf(ctx))
      const tool = allTools().find((t) => t.name === held.tool)
      const result =
        !tool || !allows(grants, tool.permission)
          ? { status: 'refused' as const, output: 'Not allowed any more' }
          : input.approve
            ? await runTool(tool, held.input, { via: { kind: 'conversation', id: c.id }, grants })
            : { status: 'declined' as const, output: 'The owner said no' }
      await store.addMessage({
        id: randomUUID(),
        conversation: c.id,
        role: 'assistant',
        parts: [{ type: 'result', id: held.id, tool: held.tool, ...result }],
        at: Date.now(),
      })
      emit({ type: 'result', id: held.id, tool: held.tool, status: result.status })
      // the agent hears how it went and says what's next, unless something else of this turn is still waiting
      if ((await store.pending(c.id)).length) return null
      return turn(core, ctx, c, emit, signal)
    },
  }
}
