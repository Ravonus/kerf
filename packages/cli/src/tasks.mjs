// `weft tasks`: the single list of what can be run (PLAN §7b). Built-ins first, then the project's `tasks`.

import { relative, resolve } from 'node:path'
import { z } from 'zod'
import { loadConfig } from './load-config.mjs'

const files = { type: 'array', items: { type: 'string' }, description: 'Files relative to the project root; default: the whole project' }

/** `available: false` marks commands PLAN names that this CLI does not ship yet. */
export const builtins = [
  { name: 'check', description: 'Compile every component in check mode and report W- and P-diagnostics with fixes', args: { type: 'object', properties: { files } }, sideEffects: [], available: true },
  { name: 'tasks', description: 'List every command and project task with args, side effects and environments', args: { type: 'object', properties: {} }, sideEffects: [], available: true },
  { name: 'docs', description: 'Print a docs topic or a diagnostic code (`weft docs W014`)', args: { type: 'object', properties: { topic: { type: 'string' } } }, sideEffects: [], available: true },
  { name: 'agents-md', description: 'Regenerate AGENTS.md from the installed weft, its diagnostics and these tasks (`--check` fails if stale)', args: { type: 'object', properties: { check: { type: 'boolean' } } }, sideEffects: ['fs:AGENTS.md'], available: true },
  { name: 'mcp', description: 'Serve `docs`, `check` and `tasks` as MCP tools over stdio', args: { type: 'object', properties: {} }, sideEffects: [], available: true, longRunning: true },
  { name: 'dev', description: 'Vite dev server with HMR', sideEffects: ['network:listen'], available: false },
  { name: 'build', description: 'Production build', sideEffects: ['fs:dist/**'], available: false },
  { name: 'test', description: 'Vitest lanes (fast, --browser, --e2e) and the test gate', sideEffects: [], available: false },
  { name: 'fix', description: 'Apply safe autofixes from `weft check`', sideEffects: ['fs:scope.write'], available: false },
  { name: 'browser', description: 'Drive the running app by role/label/text, with the reactive graph', sideEffects: ['network'], available: false },
  { name: 'run', description: 'Run a project task by name', sideEffects: ['task'], available: false },
  { name: 'create', description: 'Scaffold a weft app', sideEffects: ['fs'], available: false },
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
  const list = builtins.map(b => ({
    name: b.name,
    kind: 'builtin',
    command: { check: 'weft check --json', tasks: 'weft tasks --json', docs: 'weft docs <topic>' }[b.name] ?? `weft ${b.name}`,
    description: b.description,
    args: b.args ?? { type: 'object', properties: {} },
    sideEffects: b.sideEffects,
    env: environments,
    available: b.available,
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
