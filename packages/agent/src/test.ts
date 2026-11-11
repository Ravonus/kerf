// A bridge for tests: it answers from a script instead of a model, so a test can say "the agent calls `setPrice`
// with this" and check what the app did. Each step takes the next line; an empty script ends every turn.
import type { Bridge, BridgeTurn } from './bridge'

/** One scripted step: words, a call or calls, or a function of the turn that returns one. */
export type Line =
  | string
  | {
      text?: string
      call?: { tool: string; input?: unknown } | { tool: string; input?: unknown }[]
    }
  | ((turn: BridgeTurn) => Line | Promise<Line>)

/** A bridge that answers from `script`, one line per step, and keeps every turn it was handed in `turns`. */
export function fakeBridge(
  script: Line[],
  options: { id?: string; tools?: 'native' | 'mcp' } = {},
): Bridge & {
  turns: BridgeTurn[]
} {
  const turns: BridgeTurn[] = []
  let n = 0
  return {
    id: options.id ?? 'fake',
    label: 'Script',
    tools: options.tools ?? 'native',
    turns,
    async step(turn) {
      turns.push(turn)
      let line = script.shift() ?? ''
      while (typeof line === 'function') line = await line(turn)
      const { text = '', call } = typeof line === 'string' ? { text: line, call: undefined } : line
      if (text) turn.text(text)
      const calls = (Array.isArray(call) ? call : call ? [call] : []).map((c) => ({
        id: `call-${++n}`,
        tool: c.tool,
        input: c.input ?? {},
      }))
      return { text, calls, usage: { model: 'script', input: text.length, output: text.length } }
    },
  }
}
