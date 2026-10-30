// `weft tasks`: the single list of what can be run (PLAN §7b). Built-ins first, then the project's `tasks`.

import { existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { z } from 'zod'
import { loadConfig } from './load-config.mjs'

const files = { type: 'array', items: { type: 'string' }, description: 'Files relative to the project root; default: the whole project' }

/** `available: false` marks commands PLAN names that this CLI does not ship yet; `stack` ones ship for apps with src/routes. */
export const builtins = [
  { name: 'check', description: 'Compile every component in check mode and report W- and P-diagnostics with fixes', args: { type: 'object', properties: { files } }, sideEffects: [], available: true },
  { name: 'tasks', description: 'List every command and project task with args, side effects and environments', args: { type: 'object', properties: {} }, sideEffects: [], available: true },
  { name: 'docs', description: 'Print a docs topic or a diagnostic code (`weft docs W014`)', args: { type: 'object', properties: { topic: { type: 'string' } } }, sideEffects: [], available: true },
  { name: 'agents-md', description: 'Regenerate AGENTS.md (`--check` fails if stale)', args: { type: 'object', properties: { check: { type: 'boolean' } } }, sideEffects: ['fs:AGENTS.md'], available: true },
  { name: 'mcp', description: 'These commands as MCP tools (stdio)', args: { type: 'object', properties: {} }, sideEffects: [], available: true, longRunning: true },
  { name: 'style', description: 'Style groups: `find <query>`, `explain <group|selector>`, `matrix` (writes .weft/styles.json)', args: { type: 'object', properties: { subcommand: { type: 'string', enum: ['find', 'explain', 'matrix'] }, query: { type: 'string' }, target: { type: 'string' } } }, sideEffects: ['fs:.weft/styles.json'], available: true },
  { name: 'map', description: 'Write `.weft/map.md`: a matrix of what to call in this app', args: { type: 'object', properties: {} }, sideEffects: ['fs:.weft/map.*'], available: true },
  { name: 'add', description: 'Install a plugin and wire it into the config (`--dry-run` shows the changes)', args: { type: 'object', properties: { plugin: { type: 'string' }, 'dry-run': { type: 'boolean' } } }, sideEffects: ['fs:weft.config.*', 'fs:package.json', 'network:install'], available: true },
  { name: 'dev', description: 'Dev server', sideEffects: ['network:listen'], available: false, stack: true, longRunning: true },
  { name: 'build', description: 'Production build and contract', sideEffects: ['fs:.output/**'], available: false, stack: true },
  { name: 'start', description: 'Serve the build', sideEffects: ['network:listen'], available: false, stack: true, longRunning: true },
  { name: 'db', description: '`generate`: new migrations', sideEffects: ['fs:drizzle/**', 'fs:migrations/**', 'fs:prisma/**'], available: false, stack: true },
  { name: 'test', description: 'The test gate on the diff (`--gate`)', args: { type: 'object', properties: { gate: { type: 'boolean' }, base: { type: 'string' }, budget: { type: 'number' }, refactor: { type: 'boolean' } } }, sideEffects: ['fs:.weft/gate'], available: true },
  { name: 'fix', description: 'Apply safe autofixes from `weft check`', sideEffects: ['fs:scope.write'], available: false },
  { name: 'browser', description: 'Drive the running app in any open browser by role/label/text (`weft browser help`)', args: { type: 'object', properties: { command: { type: 'string' } } }, sideEffects: ['network:dev-server', 'fs:.weft/browser'], available: true },
  { name: 'run', description: 'Run a project task by name', sideEffects: ['task'], available: false },
  { name: 'create', description: 'Scaffold a weft app', sideEffects: ['fs'], available: false },
  { name: 'surfaces', description: "List the project's surfaces: name, kind, props and file", sideEffects: [], available: true },
  { name: 'plugins', description: 'List and explain plugins and slot bindings; `sync` regenerates .weft/slots and plugin tokens', args: { type: 'object', properties: { subcommand: { type: 'string', enum: ['list', 'explain', 'sync'] }, slot: { type: 'string' } } }, sideEffects: ['fs:.weft/**'], available: true },
]

function jsonSchema(args) {
  if (!args) return { type: 'object', properties: {} }
  if ('_zod' in args || '~standard' in args) {
    try {
      return z.toJSONSchema(args)
    } catch {
      return { type: 'object', description: 'Zod schema that has no JSON Schema form' }
    }
  }
  return args
}

export async function tasks(root) {
  root = resolve(root)
  const { file, config, diagnostics } = await loadConfig(root)
  const environments = Object.keys(config.environments ?? {})
  const stack = existsSync(join(root, 'src', 'routes'))
  const list = builtins.map(b => ({
    name: b.name,
    kind: 'builtin',
    command: { check: 'weft check --json', tasks: 'weft tasks --json', docs: 'weft docs <topic>' }[b.name] ?? `weft ${b.name}`,
    description: b.description,
    args: b.args ?? { type: 'object', properties: {} },
    sideEffects: b.sideEffects,
    env: environments,
    available: b.available || (b.stack && stack),
    ...(b.longRunning && { longRunning: true }),
  }))
  for (const [name, t] of Object.entries(config.tasks ?? {})) {
    list.push({
      name,
      kind: 'project',
      // `weft run` isn't shipped yet, so the command is the task's own; it becomes `weft run <name>` when it is.
      command: t.run,
      description: t.description ?? null,
      args: jsonSchema(t.args),
      sideEffects: t.sideEffects ?? null,
      env: t.env ?? environments,
      available: true,
    })
  }
  return {
    version: 1,
    ok: !diagnostics.some(d => d.severity === 'error'),
    root,
    config: file ? relative(root, file).split('\\').join('/') : null,
    tasks: list,
    scope: { write: config.scope?.write ?? null, read: config.scope?.read ?? null, forbid: config.scope?.forbid ?? [] },
    environments,
    diagnostics: diagnostics.filter(d => ['P003', 'P004', 'P007'].includes(d.code)),
  }
}
