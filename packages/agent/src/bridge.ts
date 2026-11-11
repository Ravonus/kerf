// A bridge is whatever answers: the Anthropic API, the local Claude CLI, a Rust service, a test script. The loop in
// `server.ts` hands it the conversation and the tools the grant allows, and it says what to write and what to call.
import type { Message, ToolInfo } from './index'

/** What a bridge is handed for one step of a turn. */
export interface BridgeTurn {
  system: string
  /** The conversation so far, ending with what the owner just said (and the calls already answered this turn). */
  messages: Message[]
  tools: ToolInfo[]
  signal: AbortSignal
  /** Who the turn is for (the conversation's owner): a bridge that meters spend per person names them. */
  who: string
  /** Words as they arrive: the page shows them as they're written. */
  text(delta: string): void
  /**
   * For a bridge that runs tools itself (the CLI): the app's MCP endpoint and a token for this turn, good for these
   * tools only. Such a bridge returns no `calls`: the endpoint records each as it runs.
   */
  mcp?: { url: string; token: string }
}

/** What a bridge answers with for one step. */
export interface BridgeStep {
  /** What it wrote this step. */
  text: string
  /** Tools it wants run before it goes on. None: the turn is over. */
  calls: { id: string; tool: string; input: unknown }[]
  usage: { model: string; input: number; output: number }
  /** The bridge's own form of this step, kept as a `native` part and handed back to it next time. */
  raw?: unknown
}

/** Whatever answers: the Anthropic API, the Claude CLI, a Rust function, a test script. */
export interface Bridge {
  /** Short and stable: stored on each conversation. */
  id: string
  /** What the owner sees in the picker. */
  label: string
  /** `native`: returns calls for the loop to run. `mcp`: runs them itself through `turn.mcp`. */
  tools: 'native' | 'mcp'
  /** False when it can't run here (no key, no CLI): the picker leaves it out. */
  available?(): boolean
  step(turn: BridgeTurn): Promise<BridgeStep>
  /**
   * Requests to `/_kerf/x/agent/bridges/<id>/<path>`: for a bridge that something outside calls in to, such as the
   * Rust bridge daemon long-polling for jobs. It checks its own credentials.
   */
  serve?: (request: Request, path: string) => Response | Promise<Response>
}

/** A message's parts as plain text: what a bridge without structured history (the CLI, a Rust planner) reads. */
export function transcript(messages: Message[]): string {
  return messages
    .map((m) => {
      const said = m.parts
        .filter((p) => p.type !== 'native')
        .map((p) =>
          p.type === 'text'
            ? p.text
            : p.type === 'call'
              ? `[called ${p.tool} ${JSON.stringify(p.input)}]`
              : p.type === 'result'
                ? `[${p.tool} → ${p.status}: ${JSON.stringify(p.output).slice(0, 2000)}]`
                : '',
        )
        .join('\n')
      return `${m.role === 'user' ? 'Owner' : 'Assistant'}: ${said}`
    })
    .join('\n\n')
}
