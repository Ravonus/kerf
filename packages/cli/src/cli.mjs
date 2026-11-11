// Argument parsing and output for `kerf`. JSON on stdout with --json, human text on stderr.
// Exit codes: 0 ok, 1 diagnostics with errors (a build refused on one, or a stale AGENTS.md under --check), 2 usage or internal error.

import { fix } from './fix.mjs'
import { writeTokens } from './tokens.mjs'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { addCommand } from './add.mjs'
import { writeAgentsMd } from './agents-md.mjs'
import { check } from './check.mjs'
import { formatHuman, sortDiagnostics } from './diag.mjs'
import { docs } from './docs.mjs'
import { compilerLine, doctor, formatDoctor } from './doctor.mjs'
import { formatMap, writeMap } from './map.mjs'
import { serve } from './mcp.mjs'
import { explain, list, sync } from './plugins.mjs'
import { approveCommand, auditCommand, formatTrust } from './trust.mjs'
import { loadConfig } from './load-config.mjs'
import { listSurfaces } from './surface-checks.mjs'
import { runTask, tasks } from './tasks.mjs'
import { formatGate, gate } from './gate.mjs'
import { browserCommand } from './browser/cli.mjs'
import { metaTable } from './meta-table.mjs'
import { audit } from './audit.mjs'
import {
  buildCommand,
  dbCommand,
  devCommand,
  doctorCommand,
  routesCommand,
  startCommand,
  unsafeAllowed,
} from './start.mjs'
import { deployCommand, formatHosts, hostsCommand, initCommand } from './deploy/index.mjs'
import {
  explainTarget,
  findGroups,
  formatExplain,
  formatFind,
  styleMatrix,
  writeMatrixFile,
} from './style.mjs'

import {
  commandLsp,
  commandTsc,
  commandCheck,
  commandDoctor,
  commandTest,
  commandBrowser,
  commandDev,
  commandBuild,
  commandAudit,
  commandDeploy,
  commandStart,
  commandDb,
  commandRoutes,
  commandSurfaces,
  commandTasks,
  commandRun,
  commandDocs,
  commandAgentsMd,
} from './cli/project.mjs'
import {
  commandMap,
  commandIcons,
  commandAdd,
  commandPlugins,
  commandFix,
  commandTokens,
  commandStyle,
  commandMcp,
} from './cli/authoring.mjs'

const usage = `usage: kerf <command> [--json] [--root <dir>]

  check [files…] [--preset <p>]  compile in check mode; W-, P- and D-diagnostics with fixes (--verbose: which compiler ran)
  doctor [--preset <p>]  which compiler this install uses, whether Rust is around (it's optional), and what live data does on the target
  fix [files…]        apply the safe autofixes
  tokens              veneer's resolved tokens as DTCG, in .kerf/tokens/
  test --gate         the test gate on the diff: fail-before (T010), mutants on changed lines (T011), no weakening (T020)
                      [--base <ref>] [--budget <sec>] [--max-mutants <n>] [--refactor] [--no-mutation]
  browser <cmd>       drive the running app (\`kerf browser help\`): open, snapshot, act, assert, net, time, record…
  lsp                 a language server for editors on TypeScript 7: tsc --lsp with inferred props
  tsc                 type-check the whole project with inferred props (tsc or tsgo; for CI)
  dev [--port <n>]    the dev server for an app with src/routes (Vite + Nitro)
  build [--runtime node|bun|deno] [--preset <p>]  production build to .output, and .kerf/contract.json; then the
                      built pages are audited (L-codes) and an error fails the build
                      [--unsafe-allow <codes>]  go past these codes (R002, L003, a family like L, or all): forces a deploy
  audit [routes…] [--url <u>] [--indexing public|private|auto] [--all] [--max <n>]  the built pages, or a running site, in a clean Chrome at a phone's
                      and a desktop's width: axe-core's WCAG rules, console, deprecations, head, sideways scroll, shift
  deploy [--prod] [--yes] [--target t]  fit check, build for the target, then the host's own CLI; without --yes a dry
                      run that prints what would run. Netlify, Vercel, Cloudflare, Fly, Render; the live URL at the end
  deploy hosts        which hosts can run this app, why not, what each costs, and the one kerf suggests
  deploy init [target] [--dry-run] [--force]  the host's files (netlify.toml, fly.toml + Dockerfile…), a GitHub
                      workflow that checks and deploys on push, and \`deploy\` in the config
  start [--runtime r] run .output/ on its runtime (the config's \`runtime\`, node by default)
  db generate [name]  a migration for the schema's changes (it applies on the next request)
  db live             a migration with change triggers for the tables in \`changes\`
  db listen           the change feed as its own process, for an app on functions
  routes [--meta]     the route table; --meta: every route's merged metadata, tags, card mode and H-diagnostics
  surfaces            the canvas and WebGL surfaces this project already defines
  tasks               commands and project tasks
  run <task>          run a project task from kerf.config.ts
  docs [topic|code]   docs for agents (rules, props, lists, async, testing, config, diagnostics, commands, W014…)
  agents-md [--check] write AGENTS.md (--check: exit 1 when stale; --stdout: print it)
  map [--stdout]      write .kerf/map.md and .json: a matrix of what to call in this app
  icons publish <dir>  every icon and variant as static .svg files with a manifest.json, for a CDN
  add <feature>       install a plugin and wire it into the config; also tailwind, auth, db [engine] [--layer drizzle|prisma|native], and rust [name] [--remote] [--dry-run] [--no-install]
  plugins [list]      plugins, the slots they provide and bind, permissions, diagnostics
  plugins explain <slot>  binding chain: config → plugin → module → .kerf/slots/<id>.ts
  plugins sync        regenerate .kerf/slots/*, .kerf/slots.d.ts and .kerf/tokens/*
  plugins audit       each plugin's permissions and code against .kerf/plugins.lock.json, and what it uses undeclared
  plugins approve [name…] [--all]  record them in the lock; with no names, show what's waiting and write nothing
  style find <query>  style groups that fit what you're about to style (\`card\`, \`status badge\`): reuse before you write
  style explain <group|selector> [--<axis> <value>] [--states a,b] [--accent intent:token] [--part p]
                      resolved CSS for one variation, and where each value came from
  style matrix        write .kerf/styles.json (every group: axes, parts, accents, resolved CSS, uses)
  mcp                 MCP server on stdio: docs, check, audit, routes_meta, map, tasks, surfaces, style_find,
                      style_explain, test_gate, browser_*`

/** Flags that take a value (`--base main` or `--base=main`), and boolean flags, beyond the global ones. */
const valued = new Set([
  'layer',
  'base',
  'budget',
  'max-mutants',
  'concurrency',
  'url',
  'indexing',
  'tab',
  'out',
  'component',
  'from',
  'props',
  'name',
  'scope',
  'timeout',
  'preset',
  'port',
  'runtime',
  'unsafe-allow',
  'max',
  'target',
])
/** `kerf style explain` takes the group's own axes as flags (`--status late`); these are its fixed ones. */
const styleFlags = new Set(['states', 'accent', 'part'])
const booleans = new Set([
  'dry-run',
  'no-install',
  'remote',
  'gate',
  'refactor',
  'no-mutation',
  'interactive',
  'delta',
  'graph-only',
  'no-graph',
  'headed',
  'full',
  'reload',
  'meta',
  'all',
  'verbose',
  'prod',
  'yes',
  'force',
])

export function parse(argv) {
  const out = {
    command: argv[0],
    positional: [],
    json: false,
    root: process.cwd(),
    check: false,
    stdout: false,
    flags: {},
  }
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
      else if (out.command === 'style' && styleFlags.has(name))
        out.flags[name] = inline ?? argv[++i]
      else if (
        out.command === 'style' &&
        /^[a-z][\w-]*$/i.test(name) &&
        (inline ?? argv[i + 1]) !== undefined
      )
        (out.flags.axes ??= {})[name] = inline ?? argv[++i]
      else throw Object.assign(new Error(`unknown flag ${a}`), { code: 'E_USAGE' })
    } else out.positional.push(a)
  }
  return out
}

const dependencies = {
  fix,
  writeTokens,
  createRequire,
  existsSync,
  join,
  resolve,
  pathToFileURL,
  addCommand,
  writeAgentsMd,
  check,
  formatHuman,
  sortDiagnostics,
  docs,
  compilerLine,
  doctor,
  formatDoctor,
  formatMap,
  writeMap,
  serve,
  explain,
  list,
  sync,
  approveCommand,
  auditCommand,
  formatTrust,
  loadConfig,
  listSurfaces,
  runTask,
  tasks,
  formatGate,
  gate,
  browserCommand,
  metaTable,
  audit,
  buildCommand,
  dbCommand,
  devCommand,
  doctorCommand,
  routesCommand,
  startCommand,
  unsafeAllowed,
  deployCommand,
  formatHosts,
  hostsCommand,
  initCommand,
  explainTarget,
  findGroups,
  formatExplain,
  formatFind,
  styleMatrix,
  writeMatrixFile,
}

export async function main(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
  const print = (data) => io.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
  const say = (text) => text && io.stderr.write(`${text}\n`)
  let args
  try {
    args = parse(argv)
    const context = { ...dependencies, args, print, say, io }
    switch (args.command) {
      case 'lsp':
        return await commandLsp(context)
      case 'tsc':
        return await commandTsc(context)
      case 'check':
        return await commandCheck(context)
      case 'doctor':
        return await commandDoctor(context)
      case 'test':
        return await commandTest(context)
      case 'browser':
        return await commandBrowser(context)
      case 'dev':
        return await commandDev(context)
      case 'build':
        return await commandBuild(context)
      case 'audit':
        return await commandAudit(context)
      case 'deploy':
        return await commandDeploy(context)
      case 'start':
        return await commandStart(context)
      case 'db':
        return await commandDb(context)
      case 'routes':
        return await commandRoutes(context)
      case 'surfaces':
        return commandSurfaces(context)
      case 'tasks':
        return await commandTasks(context)
      case 'run':
        return await commandRun(context)
      case 'docs':
        return await commandDocs(context)
      case 'agents-md':
        return await commandAgentsMd(context)
      case 'map':
        return await commandMap(context)
      case 'icons':
        return await commandIcons(context)
      case 'add':
        return await commandAdd(context)
      case 'plugins':
        return await commandPlugins(context)
      case 'fix':
        return await commandFix(context)
      case 'tokens':
        return await commandTokens(context)
      case 'style':
        return await commandStyle(context)
      case 'mcp':
        return await commandMcp(context)
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
    if (args?.json || argv.includes('--json'))
      print({ ok: false, error: { code, message: error.message } })
    say(`kerf: ${error.message}${code === 'E_USAGE' ? `\n\n${usage}` : ''}`)
    return code === 'E_REFUSED' ? 1 : 2
  }
}
