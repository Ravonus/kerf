// Keep only bounded metrics from Codex events.
const CODE = /\b[TPQHIMS]\d{3}\b/g
const SOURCE = /(?:^|[\s"'\/])node_modules\/@weft-js\/[\w-]+\/(?:src|dist)\//

/** Summarize a Codex JSONL stream without retaining agent or tool text. */
export function summarize(events, exitCode, timedOut = false) {
  const completed = events.findLast((event) => event.type === 'turn.completed')
  const failed = events.some((event) => event.type === 'turn.failed' || event.type === 'error')
  const usage = completed?.usage
  const commands = events.filter((event) => event.item?.type === 'command_execution')
  const diagnostics = {}
  let sourceRead = null
  for (const { item } of commands) {
    const command = String(item.command ?? '')
    if (/\b(cat|head|tail|less|sed|awk|rg|grep|read)\b/.test(command) && SOURCE.test(command))
      sourceRead = true
    for (const code of new Set(String(item.aggregated_output ?? '').match(CODE) ?? []))
      diagnostics[code] = (diagnostics[code] ?? 0) + 1
  }
  const validUsage = Number.isFinite(usage?.input_tokens) && Number.isFinite(usage?.output_tokens)
  return {
    ok: exitCode === 0 && !timedOut && !failed && !!completed,
    status: timedOut
      ? 'timeout'
      : failed || exitCode !== 0 ? 'failed' : completed ? 'completed' : 'incomplete',
    exitCode,
    usage: validUsage
      ? {
          input: usage.input_tokens,
          cachedInput: Number.isFinite(usage.cached_input_tokens)
            ? usage.cached_input_tokens
            : null,
          output: usage.output_tokens,
        }
      : null,
    diagnostics,
    hadToReadSource: sourceRead,
    commandEvents: commands.length,
  }
}

