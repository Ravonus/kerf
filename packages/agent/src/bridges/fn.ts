// Your own planner as the bridge: any server function that takes `bridgeInput` and returns `bridgeOutput` answers
// turns. A rules engine, a local model, a Rust sidecar (`impl: remote('rust://planner')` gets serde types for both),
// anything that can say what to call.
//
//   export const planner = mutation({ input: bridgeInput, output: bridgeOutput, run: … })
//   defineAgent({ bridges: [fnBridge({ fn: planner, label: 'House rules' })], … })
import { serverCall } from '@weft-js/start'
import { z } from 'zod'
import { transcript, type Bridge, type BridgeTurn } from '../bridge'

/** What the planner gets: the conversation as text and as structure, and the tools it may name. */
export const bridgeInput = z.object({
  system: z.string(),
  /** The conversation as plain text, oldest first. */
  transcript: z.string(),
  /** The last thing the owner said. */
  said: z.string(),
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      kind: z.enum(['query', 'mutation']),
      /** The input's JSON Schema, as a string: parse it if you need it. */
      input: z.string(),
    }),
  ),
  /** Results of the calls it asked for this turn, oldest first: it goes on from them. */
  results: z.array(z.object({ tool: z.string(), status: z.string(), output: z.string() })),
})

/** What it answers: words, and calls to run before it's asked again. No calls ends the turn. */
export const bridgeOutput = z.object({
  text: z.string(),
  calls: z.array(z.object({ tool: z.string(), input: z.string() })).default([]),
  model: z.string().default('fn'),
})

/** Which function answers, and how the picker names it. */
export interface FnBridgeOptions {
  /** The server function that answers, or its `$id`. */
  fn: { $id: string } | string
  id?: string
  label?: string
}

let n = 0

/** A server function as a bridge: it gets `bridgeInput` and answers `bridgeOutput`. */
export function fnBridge(options: FnBridgeOptions): Bridge {
  const id = typeof options.fn === 'string' ? options.fn : options.fn.$id
  return {
    id: options.id ?? 'fn',
    label: options.label ?? 'House planner',
    tools: 'native',
    async step(turn: BridgeTurn) {
      const last = turn.messages.at(-1)
      const said =
        [...turn.messages]
          .reverse()
          .find((m) => m.role === 'user')
          ?.parts.flatMap((p) => (p.type === 'text' ? [p.text] : []))
          .join('\n') ?? ''
      const results =
        last?.role === 'assistant'
          ? last.parts.flatMap((p) =>
              p.type === 'result'
                ? [
                    {
                      tool: p.tool,
                      status: p.status,
                      output: JSON.stringify(p.output ?? null).slice(0, 20_000),
                    },
                  ]
                : [],
            )
          : []
      const out = bridgeOutput.parse(
        await serverCall(id, {
          system: turn.system,
          transcript: transcript(turn.messages),
          said,
          tools: turn.tools.map((t) => ({
            name: t.name,
            description: t.description,
            kind: t.kind,
            input: JSON.stringify(t.input),
          })),
          results,
        } satisfies z.input<typeof bridgeInput>),
      )
      if (out.text) turn.text(out.text)
      return {
        text: out.text,
        calls: out.calls.map((c) => {
          let input: unknown = {}
          try {
            input = JSON.parse(c.input || '{}')
          } catch {}
          return { id: `fn-${Date.now().toString(36)}-${++n}`, tool: c.tool, input }
        }),
        usage: { model: out.model, input: 0, output: 0 },
      }
    },
  }
}
