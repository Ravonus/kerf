// A turn: the bridge writes, asks for tools, gets their results and writes again, until it's done, a call waits for
// the owner, or it runs out of steps. Every step's usage is recorded; the reply is saved as one message.
import { randomBytes, randomUUID } from 'node:crypto'
import { serverCall, type Context } from '@weft-js/start'
import type { Bridge } from '../bridge'
import {
  allows,
  type AgentCaller,
  type Conversation,
  type Message,
  type Part,
  type ToolInfo,
  type TurnEvent,
} from '../index'
import { allTools, toolsFor, unwrap } from '../tools'
import { AgentError, MCP, acting, liveTurns, turnTokens, userOf, type Core } from './core'

export type Result = { status: Extract<Part, { type: 'result' }>['status']; output: unknown }
/** A tool call as a bridge asks for it. */
export type Call = { id: string; tool: string; input: unknown }

type Failed = {
  answer?: { message?: string }
  data?: { message?: unknown }
  issues?: { path?: readonly unknown[]; message: string }[]
}

/** What went wrong, in words the agent can act on: a declared error's message, or each input issue by its path. */
export function failure(e: unknown): string {
  const f = (e ?? {}) as Failed
  if (f.answer?.message) return f.answer.message
  if (typeof f.data?.message === 'string') return f.data.message
  if (f.issues?.length) {
    const key = (p: unknown) => String(typeof p === 'object' && p ? (p as { key: unknown }).key : p)
    return `Fix the input: ${f.issues.map((i) => `${(i.path ?? []).map(key).join('.') || 'input'}: ${i.message}`).join('; ')}`
  }
  return e instanceof Error ? e.message : String(e)
}

/** Run one tool as the signed-in caller, checked against `caller`'s grants by the guard. */
export async function runTool(
  tool: ToolInfo,
  input: unknown,
  caller: AgentCaller,
  call = serverCall,
): Promise<Result> {
  try {
    const output = await acting.run({ caller, checked: false }, () =>
      call(tool.id, unwrap(tool, input)),
    )
    return { status: 'ok', output: output ?? null }
  } catch (e) {
    return { status: 'error', output: failure(e) }
  }
}

/** Whether a call runs now, waits for the owner, or is refused, and its result. */
export async function decide(
  core: Core,
  c: Conversation,
  call: Call,
  caller: AgentCaller,
): Promise<Result> {
  const tool = allTools().find((t) => t.name === call.tool)
  if (!tool) return { status: 'error', output: `There's no tool called ${call.tool}` }
  if (!allows(caller.grants, tool.permission))
    return { status: 'refused', output: `Not allowed: this needs ${tool.permission}` }
  if (tool.confirm) {
    await core.store.hold({
      id: call.id,
      conversation: c.id,
      tool: tool.name,
      input: call.input,
      at: Date.now(),
    })
    return { status: 'waiting', output: 'Waiting for the owner to approve this' }
  }
  return runTool(tool, call.input, caller)
}

/** A token and a live reply for a bridge that calls tools over MCP; `end` takes both down. */
function openMcp(
  ctx: Context,
  c: Conversation,
  caller: AgentCaller,
  reply: Message,
  emit: (e: TurnEvent) => void,
) {
  const token = `wt_${randomBytes(24).toString('base64url')}`
  turnTokens.set(token, {
    conversation: c.id,
    user: userOf(ctx),
    grants: [...caller.grants],
    expires: Date.now() + 15 * 60_000,
  })
  liveTurns.set(c.id, { reply, emit })
  return {
    mcp: { url: new URL(MCP, ctx.request.url).href, token },
    end() {
      turnTokens.delete(token)
      liveTurns.delete(c.id)
    },
  }
}

/** What a turn carries from step to step. */
type Turning = {
  c: Conversation
  caller: AgentCaller
  reply: Message
  emit: (e: TurnEvent) => void
}

/** Run a step's calls in order, recording each; true when one waits for the owner. */
async function runCalls(core: Core, calls: Call[], t: Turning) {
  const { c, caller, reply, emit } = t
  let waiting = false
  for (const call of calls) {
    reply.parts.push({ type: 'call', ...call })
    emit({ type: 'call', ...call })
    const result = await decide(core, c, call, caller)
    if (result.status === 'waiting') waiting = true
    reply.parts.push({ type: 'result', id: call.id, tool: call.tool, ...result })
    emit({ type: 'result', id: call.id, tool: call.tool, status: result.status })
  }
  return waiting
}

/** One step: the bridge's answer, kept on the reply, and its usage recorded. */
async function oneStep(
  core: Core,
  b: Bridge,
  c: Conversation,
  ask: Parameters<Bridge['step']>[0],
  reply: Message,
) {
  const started = Date.now()
  const out = await b.step(ask)
  if (out.raw !== undefined) reply.parts.push({ type: 'native', bridge: b.id, content: out.raw })
  if (out.text) reply.parts.push({ type: 'text', text: out.text })
  await core.store.addUsage({
    conversation: c.id,
    token: null,
    bridge: b.id,
    model: out.usage.model,
    input: out.usage.input,
    output: out.usage.output,
    calls: out.calls.length,
    ms: Date.now() - started,
    at: Date.now(),
  })
  return out.calls
}

/** Run a turn on `c` to its end, emitting the reply as it's written; saves the reply and returns it. */
export async function turn(
  core: Core,
  ctx: Context,
  c: Conversation,
  emit: (e: TurnEvent) => void,
  signal: AbortSignal,
) {
  const grants = core.grantsOf(userOf(ctx))
  const caller: AgentCaller = { via: { kind: 'conversation', id: c.id }, grants }
  const b = core.bridge(c.bridge)
  if (!b) throw new AgentError('AGENT003', 'No assistant is set up to answer', 503)
  const { system: sys } = core.options
  const system = typeof sys === 'function' ? await sys(ctx) : sys
  const history = await core.store.messages(c.id)
  const reply: Message = {
    id: randomUUID(),
    conversation: c.id,
    role: 'assistant',
    parts: [],
    at: Date.now(),
  }
  const live = b.tools === 'mcp' ? openMcp(ctx, c, caller, reply, emit) : undefined
  try {
    for (let n = 0; n < core.steps; n++) {
      const calls = await oneStep(
        core,
        b,
        c,
        {
          system,
          messages: [...history, ...(reply.parts.length ? [reply] : [])],
          tools: toolsFor(grants),
          signal,
          who: c.owner,
          text: (delta) => emit({ type: 'text', delta }),
          ...(live && { mcp: live.mcp }),
        },
        reply,
      )
      if (!calls.length || (await runCalls(core, calls, { c, caller, reply, emit }))) break
    }
  } finally {
    live?.end()
  }
  await core.store.addMessage(reply)
  await core.store.saveConversation({ ...c, updated: Date.now() })
  emit({ type: 'done', message: reply.id })
  return reply
}
