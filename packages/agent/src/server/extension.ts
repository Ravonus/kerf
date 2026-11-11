// The `server.extension@1` half: who a bearer token is, the guard every function call passes, and the MCP endpoint.
// The guard is the point: a tool call runs as the signed-in person, through their `auth`, and then must also be a
// function that opted in with `agent:` and one the grant allows. A person's own calls are never touched.
import { randomUUID } from 'node:crypto'
import type { Context } from '@weft-js/start'
import type { ExtensionApi, ServerExtension } from '@weft-js/start/extension'
import { allows } from '../index'
import { serveMcp } from '../mcp'
import { allTools, toolsFor } from '../tools'
import { AgentError, acting, liveTurns, type Core } from './core'
import { decide, runTool, type Result } from './run'
import { bearer } from './tokens'

/** Checked, held or run: what an MCP call comes to. */
async function outcome(
  core: Core,
  ctx: Context,
  call: ExtensionApi['call'],
  id: string,
  name: string,
  input: unknown,
): Promise<Result> {
  const caller = ctx.agent!
  const tool = allTools().find((t) => t.name === name)
  if (!tool) return { status: 'error', output: `There's no tool called ${name}` }
  if (!allows(caller.grants, tool.permission))
    return { status: 'refused', output: `Not allowed: this needs ${tool.permission}` }
  if (tool.confirm && caller.via.kind === 'token')
    return { status: 'refused', output: 'This one needs the owner to approve it in the app' }
  if (!tool.confirm) return runTool(tool, input, caller, call)
  const c = await core.store.conversation(caller.via.id)
  return c
    ? decide(core, c, { id, tool: name, input }, caller)
    : { status: 'error', output: 'The conversation is gone' }
}

/** An MCP tool call, recorded on the turn it belongs to or as a token's usage. */
async function mcpCall(
  core: Core,
  ctx: Context,
  call: ExtensionApi['call'],
  name: string,
  input: unknown,
) {
  const caller = ctx.agent!
  const live = caller.via.kind === 'conversation' ? liveTurns.get(caller.via.id) : undefined
  const id = randomUUID()
  live?.reply.parts.push({ type: 'call', id, tool: name, input })
  live?.emit({ type: 'call', id, tool: name, input })
  const result = await outcome(core, ctx, call, id, name, input)
  live?.reply.parts.push({ type: 'result', id, tool: name, ...result })
  live?.emit({ type: 'result', id, tool: name, status: result.status })
  if (caller.via.kind === 'token')
    await core.store.addUsage({
      conversation: null,
      token: caller.via.id,
      bridge: 'mcp',
      model: 'external',
      input: 0,
      output: 0,
      calls: 1,
      ms: 0,
      at: Date.now(),
    })
  return result
}

/** The guard: outside a tool call a token's caller is turned away; inside one, the outermost function must be offered and granted. */
function guard(fn: { id: string }, ctx: Context) {
  const a = acting.getStore()
  // a token's caller only reaches functions through the MCP endpoint, which runs each under `acting`
  if (!a) {
    if (ctx.agent) throw new AgentError('AGENT007', 'Agents call tools through /_weft/x/agent/mcp')
    return
  }
  if (a.checked) return
  a.checked = true
  const tool = allTools().find((t) => t.id === fn.id)
  if (!tool)
    throw new AgentError('AGENT008', `\`${fn.id}\` isn't offered to agents: add \`agent:\` to it`)
  if (!allows(a.caller.grants, tool.permission))
    throw new AgentError('AGENT009', `Not allowed: this needs ${tool.permission}`)
}

/** The extension `defineAgent` hands weft. */
export function agentExtension(core: Core): ServerExtension {
  return {
    options: ['agent'],
    personal: ['agent'],
    context: (ctx) => bearer(core, ctx),
    guard,
    async handle(request, path, ext) {
      if (path !== 'mcp') return new Response('Not found', { status: 404 })
      const ctx = await ext.ctx()
      if (!ctx.agent)
        return new Response('A bearer token is required', {
          status: 401,
          headers: { 'www-authenticate': 'Bearer' },
        })
      return serveMcp(request, {
        tools: () => toolsFor(ctx.agent!.grants),
        call: (name, input) => mcpCall(core, ctx, ext.call, name, input),
      })
    },
    check(dev) {
      if (!dev && core.store.memory)
        throw new AgentError(
          'AGENT010',
          '`memoryAgentStore()` on a production server: conversations would vanish on restart',
          500,
        )
    },
  }
}
