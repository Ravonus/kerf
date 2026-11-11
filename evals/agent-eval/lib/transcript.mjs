// Numbers from a session's raw events. Token-for-token: `total` counts every token the model was sent or wrote, with cache
// reads and writes in it and shown beside it, so caching can't flatter a stack.
const add = (a, u) => {
  a.input += u.input_tokens ?? 0
  a.output += u.output_tokens ?? 0
  a.cacheRead += u.cache_read_input_tokens ?? 0
  a.cacheWrite += u.cache_creation_input_tokens ?? 0
}
const zero = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
const total = (t) => t.input + t.output + t.cacheRead + t.cacheWrite

/** The session's own totals, from the last `result`: it includes subagents and is cumulative across follow-ups. */
export function usage(result) {
  if (!result) return null
  const tokens = zero()
  for (const m of Object.values(result.modelUsage ?? {}))
    add(tokens, {
      input_tokens: m.inputTokens,
      output_tokens: m.outputTokens,
      cache_read_input_tokens: m.cacheReadInputTokens,
      cache_creation_input_tokens: m.cacheCreationInputTokens,
    })
  return {
    ...tokens,
    total: total(tokens),
    costUsd: result.total_cost_usd,
    turns: result.num_turns,
    apiMs: result.duration_api_ms,
    models: Object.keys(result.modelUsage ?? {}),
    terminal: result.terminal_reason,
    subtype: result.subtype,
    isError: result.is_error,
    webSearches: Object.values(result.modelUsage ?? {}).reduce(
      (n, m) => n + (m.webSearchRequests ?? 0),
      0,
    ),
    subagents: result.subagent_stats?.completed ?? 0,
  }
}

/** The fixed set for every run. Out: anything that can act beyond the box, such as remote triggers, cron and push. */
export const TOOLS = 'Task,Bash,Edit,Read,Write,WebFetch,WebSearch,ToolSearch,Monitor,TaskStop'

const CODE = /\b[TPQHIMS]\d{3}\b/g
const DOCS =
  /node_modules\/(?:@kerf\/[\w-]+|kerf|next)(?:\/dist)?\/docs\/[\w./-]+|AGENTS\.md|\bkerf docs(?: [\w-]+)?/g

/** What the session did: tool counts, URLs, docs read, kerf diagnostics met. Same scan for every stack. */
export function activity(events) {
  const tools = {},
    urls = [],
    docs = {},
    codes = {},
    commands = []
  const pending = new Map()
  for (const e of events) {
    for (const c of e.message?.content ?? []) {
      if (e.type === 'assistant' && c.type === 'tool_use') {
        tools[c.name] = (tools[c.name] ?? 0) + 1
        pending.set(c.id, c)
        const blob = JSON.stringify(c.input)
        for (const m of blob.match(DOCS) ?? []) docs[m] = (docs[m] ?? 0) + 1
        if (c.input?.url) urls.push(c.input.url)
        if (c.input?.query) urls.push(`search:${c.input.query}`)
        if (c.name === 'Bash') commands.push(String(c.input.command).slice(0, 200))
      }
      if (e.type === 'user' && c.type === 'tool_result') {
        const from = pending.get(c.tool_use_id)
        if (from?.name === 'Bash' && /\bkerf\b/.test(from.input.command ?? '')) {
          const text = typeof c.content === 'string' ? c.content : JSON.stringify(c.content)
          for (const m of new Set(text.match(CODE) ?? [])) codes[m] = (codes[m] ?? 0) + 1
        }
      }
    }
  }
  return {
    toolCalls: Object.values(tools).reduce((a, b) => a + b, 0),
    tools,
    urls,
    docs,
    diagnostics: codes,
    commands,
  }
}

// The bare login name is out of this list: `ls -l` prints it as a file owner in every run on every stack. research 42 declares it.
/** Strings from the user's own instructions, memory and machine. Any of them in a request or a tool result is a leak. */
export const FORBIDDEN = [
  'yuna-mbp',
  'M4 Max',
  'lemonstand',
  'Performance over bytes',
  'performance-over-bytes',
  'kerf-wt',
  'chadkoslovsky',
  ...(process.env.HOME ? [process.env.HOME] : []),
]

/** The first event of a session, checked for anything a run shouldn't have been given. */
export function checkInit(events) {
  const init = events.find((e) => e.type === 'system' && e.subtype === 'init')
  if (!init) return { ok: false, why: 'no init event' }
  const problems = []
  if (init.mcp_servers?.length) problems.push(`mcp: ${JSON.stringify(init.mcp_servers)}`)
  const foreign = (init.plugins ?? []).filter((p) => !p.source?.endsWith('@builtin'))
  if (foreign.length) problems.push(`plugins: ${JSON.stringify(foreign)}`)
  const extra = (init.tools ?? []).filter((t) => !TOOLS.split(',').includes(t))
  if (extra.length) problems.push(`tools outside the fixed set: ${extra}`)
  if (!init.cwd?.startsWith('/private/tmp/projects/')) problems.push(`cwd ${init.cwd}`)
  return {
    ok: !problems.length,
    problems,
    model: init.model,
    cwd: init.cwd,
    version: init.claude_code_version,
    tools: init.tools,
    skills: init.skills,
    agents: init.agents,
    plugins: init.plugins?.map((p) => p.name),
    slash: init.slash_commands?.length,
  }
}
export function leaks(events, strings = FORBIDDEN) {
  const text = JSON.stringify(events.filter((e) => e.type !== 'result'))
  return strings.filter((s) => text.includes(s))
}
