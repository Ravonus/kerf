// Argument parsing and output for `weft`. JSON on stdout with --json, human text on stderr.
// Exit codes: 0 ok, 1 diagnostics with errors (or a stale AGENTS.md under --check), 2 usage or internal error.

import { fix } from './fix.mjs'
import { writeTokens } from './tokens.mjs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { addCommand } from './add.mjs'
import { writeAgentsMd } from './agents-md.mjs'
import { check } from './check.mjs'
import { formatHuman } from './diag.mjs'
import { docs } from './docs.mjs'
import { formatMap, writeMap } from './map.mjs'
import { serve } from './mcp.mjs'
import { explain, list, sync } from './plugins.mjs'
import { approveCommand, auditCommand, formatTrust } from './trust.mjs'
import { loadConfig } from './load-config.mjs'
import { listSurfaces } from './surface-checks.mjs'
import { tasks } from './tasks.mjs'
import { formatGate, gate } from './gate.mjs'
import { browserCommand, browserUsage } from './browser/cli.mjs'
import { buildCommand, dbCommand, devCommand, routesCommand, startCommand } from './start.mjs'
import { explainTarget, findGroups, formatExplain, formatFind, styleMatrix, writeMatrixFile } from './style.mjs'

const usage = `usage: weft <command> [--json] [--root <dir>]

  check [files…]      compile in check mode; W-, P- and D-diagnostics with fixes
  fix [files…]        apply the safe autofixes
  tokens              warp's resolved tokens as DTCG, in .weft/tokens/
  test --gate         the test gate on the diff: fail-before (T010), mutants on changed lines (T011), no weakening (T020)
                      [--base <ref>] [--budget <sec>] [--max-mutants <n>] [--refactor] [--no-mutation]
  browser <cmd>       drive the running app (\`weft browser help\`): open, snapshot, act, assert, net, time, record…
  dev [--port <n>]    the dev server for an app with src/routes (Vite + Nitro)
  build [--runtime node|bun|deno] [--preset <p>]  production build to .output, and .weft/contract.json
  start [--runtime r] run .output/ on its runtime (the config's \`runtime\`, node by default)
  db generate [name]  a migration for the schema's changes (it applies on the next request)
  routes [--meta]     the route table; --meta: every route's merged metadata, tags, card mode and H-diagnostics
  tasks               commands and project tasks
  docs [topic|code]   docs for agents (rules, props, lists, async, testing, config, diagnostics, commands, W014…)
  agents-md [--check] write AGENTS.md (--check: exit 1 when stale; --stdout: print it)
  map [--stdout]      write .weft/map.md and .json: a matrix of what to call in this app
  add <feature>       install a plugin and wire it into the config; also tailwind, auth, pay, and db [engine] [--layer drizzle|prisma|native] [--dry-run] [--no-install]
  plugins [list]      plugins, the slots they provide and bind, permissions, diagnostics
  plugins explain <slot>  binding chain: config → plugin → module → .weft/slots/<id>.ts
  plugins sync        regenerate .weft/slots/*, .weft/slots.d.ts and .weft/tokens/*
  plugins audit       each plugin's permissions and code against .weft/plugins.lock.json, and what it uses undeclared
  plugins approve [name…] [--all]  record them in the lock; with no names, show what's waiting and write nothing
  style find <query>  style groups that fit what you're about to style (\`card\`, \`status badge\`): reuse before you write
  style explain <group|selector> [--<axis> <value>] [--states a,b] [--accent intent:token] [--part p]
                      resolved CSS for one variation, and where each value came from
  style matrix        write .weft/styles.json (every group: axes, parts, accents, resolved CSS, uses)
  mcp                 MCP server on stdio: docs, check, tasks, style_find, style_explain, test_gate, browser_*`

/** Flags that take a value (`--base main` or `--base=main`), and boolean flags, beyond the global ones. */
const valued = new Set(['layer', 'base', 'budget', 'max-mutants', 'concurrency', 'url', 'tab', 'out', 'component', 'from', 'props', 'name', 'scope', 'timeout', 'preset', 'port', 'runtime'])
/** `weft style explain` takes the group's own axes as flags (`--status late`); these are its fixed ones. */
const styleFlags = new Set(['states', 'accent', 'part'])
const booleans = new Set(['dry-run', 'no-install', 'gate', 'refactor', 'no-mutation', 'interactive', 'delta', 'graph-only', 'no-graph', 'headed', 'full', 'reload', 'meta', 'all'])

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
      else if (out.command === 'style' && styleFlags.has(name)) out.flags[name] = inline ?? argv[++i]
      else if (out.command === 'style' && /^[a-z][\w-]*$/i.test(name) && (inline ?? argv[i + 1]) !== undefined) (out.flags.axes ??= {})[name] = inline ?? argv[++i]
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
      case 'dev': {
        const server = await devCommand(args.root, { port: args.flags.port && Number(args.flags.port) })
        say(`weft dev: ${server.resolvedUrls.local[0]}`)
        await new Promise(ok => process.once('SIGINT', ok))
        await server.close()
        return 0
      }
      case 'build': {
        const result = await buildCommand(args.root, { preset: args.flags.preset, runtime: args.flags.runtime })
        if (args.json) print(result)
        say(formatHuman(result.diagnostics))
        say(`weft build: ${result.preset} → ${result.output}, ${result.functions} functions in the contract (${result.ms} ms)`)
        return 0
      }
      case 'start':
        return await startCommand(args.root, { runtime: args.flags.runtime })
      case 'db': {
        const result = await dbCommand(args.root, args.positional[0], args.positional[1])
        if (args.json) print(result)
        say(result.output)
        return 0
      }
      case 'routes': {
        const result = await routesCommand(args.root, { meta: !!args.flags.meta, preset: args.flags.preset })
        if (args.json) print(result)
        else say(result.routes.map(r => `${r.path.padEnd(24)} ${r.file}${r.meta ? `  ${r.meta.title}${r.image ? `  [card: ${r.image}]` : ''}` : ''}`).join('\n'))
        say(formatHuman(result.diagnostics))
        return result.ok ? 0 : 1
      }
      case 'surfaces': {
        const surfaces = listSurfaces(args.root)
        if (args.json) print({ surfaces })
        else say(surfaces.length ? surfaces.map(x => `${String(x.name).padEnd(20)} ${String(x.kind).padEnd(10)} ${x.file}:${x.line}  props: ${x.props.join(', ') || '(none)'}`).join('\n') : 'No surfaces yet: `weft docs surface`.')
        return 0
      }
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
      case 'map': {
        const map = await writeMap(args.root)
        if (args.json) print(map)
        else if (args.stdout) process.stdout.write(formatMap(map))
        else say(`.weft/map.md: ${map.rows.length} rows`)
        return 0
      }
      case 'icons': {
        if (args.positional[0] !== 'publish' || !args.positional[1]) { say('usage: weft icons publish <dir>'); return 1 }
        const { publish } = await import(pathToFileURL(createRequire(join(args.root, 'package.json')).resolve('@weft/icons/compile')).href)
        const out = await publish(resolve(args.root, args.positional[1]))
        if (args.json) print(out)
        else say(`${out.files} files for ${out.icons} icons in ${out.dir}. Nothing was uploaded: host that folder, then set icons({ source }).`)
        return 0
      }
      case 'add': {
        const result = await addCommand(args.root, args.positional[0], { dryRun: args.flags['dry-run'], install: !args.flags['no-install'], engine: args.positional[1], layer: args.flags.layer })
        if (args.json) print(result)
        else say(result.already ? `${result.package} is already in ${result.config}` : result.actions.map(a => `${args.flags['dry-run'] ? 'would ' : ''}${a}`).join('\n'))
        return 0
      }
      case 'plugins': {
        const sub = args.positional[0] ?? 'list'
        if (sub === 'list') {
          const result = await list(args.root)
          if (args.json) print(result)
          else say(result.plugins.map(p => `${p.name}@${p.version ?? '?'}  ${p.provides.map(s => `${s.slot}${s.key ? `[${s.key}]` : ''}${s.bound ? '' : ' (not bound)'}`).join(', ') || 'no slots'}${p.tokens ? `  tokens --${p.tokens}-*` : ''}`).join('\n') || 'no plugins')
          say(formatHuman(result.diagnostics))
          return result.ok ? 0 : 1
        }
        if (sub === 'explain') {
          const result = await explain(args.root, args.positional[1])
          if (args.json) print(result)
          else say(JSON.stringify(result.binding, null, 2))
          return 0
        }
        if (sub === 'sync') {
          const loaded = await loadConfig(args.root)
          const errors = loaded.diagnostics.filter(d => d.severity === 'error')
          const written = loaded.diagnostics.some(d => d.code === 'P007') ? [] : sync(args.root, loaded)
          if (args.json) print({ ok: errors.length === 0, written, diagnostics: loaded.diagnostics })
          say(formatHuman(loaded.diagnostics))
          say(`weft plugins sync: ${written.length} files written`)
          return errors.length ? 1 : 0
        }
        if (sub === 'audit') {
          const loaded = await loadConfig(args.root)
          const result = auditCommand(args.root, loaded)
          if (args.json) print(result)
          else say(result.plugins.map(formatTrust).join('\n') || 'no plugins')
          say(formatHuman(result.diagnostics))
          return result.ok ? 0 : 1
        }
        if (sub === 'approve') {
          const result = approveCommand(args.root, await loadConfig(args.root), { names: args.positional.slice(1), all: !!args.flags.all })
          if (args.json) print(result)
          else say([...(result.written ? result.approved : result.pending).map(formatTrust), result.written ? `${result.lock}: ${result.approved.length} approved` : result.pending.length ? 'nothing written: name a plugin, or pass --all' : 'nothing waiting', ...result.written ? result.pending.map(p => `still waiting: ${p.name}`) : [], ...(result.gitignore ? ['.gitignore: the lock is no longer ignored, so commit it'] : [])].join('\n'))
          return result.ok ? 0 : 1
        }
        throw Object.assign(new Error(`unknown plugins subcommand ${sub}`), { code: 'E_USAGE' })
      }
      case 'fix': {
        const result = await fix(args.root, { files: args.positional })
        if (args.json) print(result)
        else say(result.applied.length ? result.applied.map(a => `${a.file}:${a.span[0]}:${a.span[1]}  ${a.code}`).join('\n') : 'nothing to fix')
        return 0
      }
      case 'tokens': {
        const result = await writeTokens(args.root)
        if (args.json) print(result)
        else say(`${result.dir}: ${result.files.length} files`)
        return 0
      }
      case 'style': {
        const sub = args.positional[0]
        if (sub === 'find') {
          const result = findGroups((await styleMatrix(args.root)).matrix, args.positional.slice(1).join(' '))
          if (args.json) print(result)
          else say(formatFind(result))
          return 0
        }
        if (sub === 'explain') {
          const accent = args.flags.accent ? Object.fromEntries(args.flags.accent.split(/[\s,]+/).filter(Boolean).map(w => w.split(':'))) : undefined
          const states = args.flags.states?.split(',').map(s => s.trim()).filter(Boolean)
          const result = explainTarget(await styleMatrix(args.root), args.positional.slice(1).join(' '), { axes: args.flags.axes, states, accent, part: args.flags.part })
          if (args.json) print(result)
          else say(formatExplain(result))
          return 0
        }
        if (sub === 'matrix') {
          const { matrix } = await styleMatrix(args.root)
          const written = args.stdout ? false : writeMatrixFile(args.root, matrix)
          if (args.stdout || args.json) print(matrix)
          say(`.weft/styles.json: ${Object.keys(matrix.groups).length} groups, ${matrix.diagnostics.length} diagnostics, ${args.stdout ? 'not written' : written ? 'written' : 'current'}`)
          return 0
        }
        throw Object.assign(new Error(`weft style ${sub ?? ''}: use find <query>, explain <group|selector> or matrix`), { code: 'E_USAGE' })
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
