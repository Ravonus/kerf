// Argument parsing and output for `weft`. JSON on stdout with --json, human text on stderr.
// Exit codes: 0 ok, 1 diagnostics with errors (or a stale AGENTS.md under --check), 2 usage or internal error.

import { resolve } from 'node:path'
import { writeAgentsMd } from './agents-md.mjs'
import { check } from './check.mjs'
import { formatHuman } from './diag.mjs'
import { docs } from './docs.mjs'
import { serve } from './mcp.mjs'
import { tasks } from './tasks.mjs'
import { formatGate, gate } from './gate.mjs'
import { browserCommand, browserUsage } from './browser/cli.mjs'

const usage = `usage: weft <command> [--json] [--root <dir>]

  check [files…]      compile in check mode; W- and P-diagnostics with fixes
  test --gate         the test gate on the diff: fail-before (T010), mutants on changed lines (T011), no weakening (T020)
                      [--base <ref>] [--budget <sec>] [--max-mutants <n>] [--refactor] [--no-mutation]
  browser <cmd>       drive the running app (\`weft browser help\`): open, snapshot, act, assert, net, time, record…
  tasks               commands and project tasks
  docs [topic|code]   docs for agents (rules, props, lists, async, testing, config, diagnostics, commands, W014…)
  agents-md [--check] write AGENTS.md (--check: exit 1 when stale; --stdout: print it)
  mcp                 MCP server on stdio: docs, check, tasks`

/** Flags that take a value (`--base main` or `--base=main`), and boolean flags, beyond the global ones. */
const valued = new Set(['base', 'budget', 'max-mutants', 'concurrency', 'url', 'tab', 'out', 'component', 'from', 'props', 'name', 'scope', 'timeout'])
const booleans = new Set(['gate', 'refactor', 'no-mutation', 'interactive', 'delta', 'graph-only', 'no-graph', 'headed', 'full', 'reload'])

export function parse(argv) {
  const out = { command: argv[0], positional: [], json: false, root: process.cwd(), check: false, stdout: false, flags: {} }
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') out.json = true
    else if (a === '--check') out.check = true
    else if (a === '--stdout') out.stdout = true
    else if (a === '--root') out.root = resolve(argv[++i] ?? '.')
    else if (a.startsWith('--root=')) out.root = resolve(a.slice(7))
    else if (a.startsWith('--')) {
      const [name, inline] = a.slice(2).split(/=(.*)/s)
      if (valued.has(name)) out.flags[name] = inline ?? argv[++i]
      else if (booleans.has(name) && inline === undefined) out.flags[name] = true
      else throw Object.assign(new Error(`unknown flag ${a}`), { code: 'E_USAGE' })
    } else out.positional.push(a)
  }
  return out
}

export async function main(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
  const print = data => io.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
  const say = text => text && io.stderr.write(`${text}\n`)
  let args
  try {
    args = parse(argv)
    switch (args.command) {
      case 'check': {
        const result = await check(args.root, { files: args.positional })
        if (args.json) print(result)
        say(formatHuman(result.diagnostics))
        say(`weft check: ${result.summary.files} files, ${result.summary.errors} errors, ${result.summary.warnings} warnings (${result.ms} ms)`)
        return result.ok ? 0 : 1
      }
      case 'test': {
        if (!args.flags.gate) throw Object.assign(new Error('`weft test` runs the gate with --gate; run the suite itself with vitest'), { code: 'E_USAGE' })
        const num = name => (args.flags[name] === undefined ? undefined : Number(args.flags[name]))
        const result = await gate(args.root, {
          base: args.flags.base, budgetSec: num('budget'), maxMutants: num('max-mutants'), concurrency: num('concurrency'),
          refactor: !!args.flags.refactor, mutation: !args.flags['no-mutation'], log: line => say(line),
        })
        if (args.json) print(result)
        say(formatHuman(result.diagnostics))
        say(formatGate(result))
        say(`weft test --gate: ${result.ok ? 'pass' : 'fail'}, ${result.summary.changedTests} changed tests, ${result.summary.errors} errors, ${result.summary.warnings} warnings (${result.ms} ms)`)
        return result.ok ? 0 : 1
      }
      case 'browser':
        return await browserCommand(args, { print, say, io })
      case 'tasks': {
        const result = await tasks(args.root)
        if (args.json) print(result)
        else say(result.tasks.map(t => `${t.available ? ' ' : '·'} ${t.name.padEnd(10)} ${t.description ?? ''}`).join('\n'))
        say(formatHuman(result.diagnostics))
        return result.ok ? 0 : 1
      }
      case 'docs': {
        const page = await docs(args.root, args.positional[0])
        if (args.json) print(page)
        else io.stdout.write(`${page.text}\n`)
        return 0
      }
      case 'agents-md': {
        const out = await writeAgentsMd(args.root, { check: args.check || args.stdout })
        if (args.stdout) io.stdout.write(out.text)
        if (args.json) print({ path: out.path, bytes: out.bytes, limit: 8192, overLimit: out.overLimit, current: out.current, written: out.written })
        say(`AGENTS.md: ${out.bytes} bytes${out.overLimit ? ' (over the 8 KB limit)' : ''}, ${out.written ? 'written' : out.current ? 'current' : 'stale'}`)
        return (args.check && !out.current) || out.overLimit ? 1 : 0
      }
      case 'mcp':
        await serve(args.root)
        return 0
      case undefined:
      case 'help':
      case '--help':
        say(usage)
        return args.command ? 0 : 2
      default:
        throw Object.assign(new Error(`unknown command ${args.command}`), { code: 'E_USAGE' })
    }
  } catch (error) {
    const code = error.code ?? 'E_INTERNAL'
    if (args?.json || argv.includes('--json')) print({ ok: false, error: { code, message: error.message } })
    say(`weft: ${error.message}${code === 'E_USAGE' ? `\n\n${usage}` : ''}`)
    return 2
  }
}
