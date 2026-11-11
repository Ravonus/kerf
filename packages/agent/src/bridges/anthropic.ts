// The Anthropic API, through the official SDK: real tool use, streamed. Each step's content goes back to the API
// unchanged next step (a `native` part), so thinking blocks stay valid across a turn's tool rounds.
import type { Bridge, BridgeTurn } from '../bridge'
import type { Message, Part } from '../index'

/** How the Anthropic bridge calls the API. */
export interface AnthropicOptions {
  /** Default `claude-sonnet-5-5`. */
  model?: string
  /** Default `medium`: an assistant that runs a site wants answers quickly. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  maxTokens?: number
  /** Default `ANTHROPIC_API_KEY`. */
  apiKey?: string
  id?: string
  label?: string
}

type Block = { type: string; id?: string; name?: string; input?: unknown; text?: string }
type ApiMessage = { role: 'user' | 'assistant'; content: unknown[] }

const resultText = (output: unknown) =>
  (typeof output === 'string' ? output : JSON.stringify(output ?? null)).slice(0, 20_000)

/** The conversation as the API wants it: a step's own content, then the results of its tool calls. */
export function toApi(messages: Message[]): ApiMessage[] {
  const out: ApiMessage[] = []
  const push = (role: ApiMessage['role'], content: unknown[]) => {
    if (!content.length) return
    const last = out.at(-1)
    if (last?.role === role) last.content.push(...content)
    else out.push({ role, content: [...content] })
  }
  for (const m of messages) {
    if (m.role === 'user') {
      push(
        'user',
        m.parts.flatMap((p) => (p.type === 'text' ? [{ type: 'text', text: p.text }] : [])),
      )
      continue
    }
    const results = new Map(
      m.parts.flatMap((p) => (p.type === 'result' ? [[p.id, p] as const] : [])),
    )
    const answered = new Set<string>()
    for (const p of m.parts) {
      if (p.type !== 'native') continue
      const content = p.content as Block[]
      push('assistant', content)
      const uses = content.filter((b) => b.type === 'tool_use' && b.id)
      push(
        'user',
        uses.map((b) => {
          const r = results.get(b.id!)
          answered.add(b.id!)
          return {
            type: 'tool_result',
            tool_use_id: b.id,
            content: r ? resultText(r.output) : 'No result',
            is_error: !r || r.status !== 'ok',
          }
        }),
      )
    }
    // what another bridge wrote, and results that came later (an approval): as words
    const loose = m.parts.filter(
      (p): p is Exclude<Part, { type: 'native' }> =>
        p.type !== 'native' &&
        !(p.type === 'result' && answered.has(p.id)) &&
        !(p.type === 'call' && answered.has(p.id)),
    )
    if (m.parts.some((p) => p.type === 'native')) {
      const late = loose.filter((p) => p.type === 'result')
      push(
        'user',
        late.map((p) => ({
          type: 'text',
          text: `[${p.tool} → ${p.status}: ${resultText(p.output)}]`,
        })),
      )
      continue
    }
    const said = loose.filter((p) => p.type !== 'result')
    push(
      'assistant',
      said.map((p) => ({
        type: 'text',
        text: p.type === 'text' ? p.text : `[called ${p.tool} ${JSON.stringify(p.input)}]`,
      })),
    )
    push(
      'user',
      loose
        .filter((p) => p.type === 'result')
        .map((p) => ({ type: 'text', text: `[${p.tool} → ${p.status}: ${resultText(p.output)}]` })),
    )
  }
  // the API wants the user to speak first
  if (out[0]?.role === 'assistant')
    out.unshift({ role: 'user', content: [{ type: 'text', text: '(continuing)' }] })
  return out
}

/** The Anthropic API as a bridge: available when there is an API key. */
export function anthropic(options: AnthropicOptions = {}): Bridge {
  const key = () => options.apiKey ?? process.env.ANTHROPIC_API_KEY?.trim()
  return {
    id: options.id ?? 'claude',
    label: options.label ?? 'Claude',
    tools: 'native',
    available: () => !!key(),
    async step(turn: BridgeTurn) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey: key(), maxRetries: 1 })
      const stream = client.messages.stream(
        {
          model: options.model ?? 'claude-sonnet-5-5',
          max_tokens: options.maxTokens ?? 16_000,
          output_config: { effort: options.effort ?? 'medium' },
          system: turn.system,
          messages: toApi(turn.messages) as never,
          ...(turn.tools.length && {
            tools: turn.tools.map((t) => ({
              name: t.name,
              description: t.confirm
                ? `${t.description} (the owner approves each call)`
                : t.description,
              input_schema: t.input as never,
            })),
          }),
        } as never,
        { signal: turn.signal },
      )
      for await (const event of stream as AsyncIterable<{
        type: string
        delta?: { type: string; text?: string }
      }>) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta')
          turn.text(event.delta.text ?? '')
      }
      const message = (await stream.finalMessage()) as unknown as {
        model: string
        stop_reason: string
        content: Block[]
        usage: { input_tokens: number; output_tokens: number }
      }
      if (message.stop_reason === 'refusal') throw new Error('Claude declined this one')
      // a tool call cut off at the limit can still parse: never run one
      if (
        message.stop_reason === 'max_tokens' &&
        message.content.some((b) => b.type === 'tool_use')
      )
        throw new Error('The answer ran past its length limit mid-call; nothing was run')
      return {
        text: message.content.flatMap((b) => (b.type === 'text' ? [b.text ?? ''] : [])).join(''),
        calls: message.content.flatMap((b) =>
          b.type === 'tool_use' ? [{ id: b.id!, tool: b.name!, input: b.input ?? {} }] : [],
        ),
        usage: {
          model: message.model,
          input: message.usage.input_tokens,
          output: message.usage.output_tokens,
        },
        raw: message.content,
      }
    },
  }
}
