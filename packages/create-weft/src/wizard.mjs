// The create-weft wizard (research 34 §3): each choice is a list with the default selected. A flag answers its question,
// and with no terminal or with --yes every unanswered question takes its default, so agents and CI never see a prompt.
import { emitKeypressEvents } from 'node:readline'
import { CONFIGS, DB, LAYERS, RUNTIMES, UI } from './index.mjs'

const PMS = ['npm', 'pnpm', 'bun', 'deno', 'yarn']
const LABELS = {
  warp: 'warp',
  headless: 'Headless (warp behaviour, your markup)',
  tailwind: 'Tailwind',
  none: 'None',
  sqlite: 'SQLite',
  postgres: 'Postgres',
  mysql: 'MySQL',
  drizzle: 'Drizzle',
  prisma: 'Prisma',
  native: 'Native (no ORM)',
  node: 'Node',
  bun: 'Bun',
  deno: 'Deno',
  npm: 'npm',
  pnpm: 'pnpm',
  yarn: 'Yarn',
  ts: 'TypeScript',
  json: 'JSON',
  yaml: 'YAML',
}
const list = (values) => values.map((value) => ({ value, label: LABELS[value] ?? value }))
const yesNo = [
  { value: true, label: 'Yes' },
  { value: false, label: 'No' },
]
/** Whichever of Node, Bun and Deno is running this: a machine may have only that one. */
const host = process.versions.deno ? 'deno' : process.versions.bun ? 'bun' : 'node'
const packageManager = (env) =>
  host === 'node' ? (PMS.find((pm) => env.npm_config_user_agent?.startsWith(pm)) ?? 'npm') : host

/** In order. `when` skips a question that doesn't apply. `sideEffect` questions default to off with no terminal. */
export const questions = (env) => [
  { key: 'ui', label: 'UI', default: 'warp', options: list(UI) },
  { key: 'db', label: 'Database', default: 'sqlite', options: list(DB) },
  {
    key: 'layer',
    label: 'Data layer',
    default: 'drizzle',
    skip: 'drizzle',
    options: list(LAYERS),
    when: (a) => a.db !== 'none',
  },
  {
    key: 'auth',
    label: 'Sign-in',
    default: true,
    options: [
      { value: true, label: 'Better Auth' },
      { value: 'custom', label: 'Bring your own' },
      { value: false, label: 'None' },
    ],
    when: (a) => a.db !== 'none',
  },
  { key: 'runtime', label: 'Runtime', default: host, options: list(RUNTIMES) },
  { key: 'config', label: 'Config file', default: 'ts', options: list(CONFIGS) },
  { key: 'pm', label: 'Package manager', default: packageManager(env), options: list(PMS) },
  { key: 'git', label: 'Start a git repository', default: true, options: yesNo, sideEffect: true },
  {
    key: 'install',
    label: 'Install dependencies',
    default: true,
    options: yesNo,
    sideEffect: true,
  },
]

/** One list on a terminal: arrows move, Enter picks. Resolves with the option's value. */
export function select({ label, options, default: initial }, { input, output }) {
  let at = Math.max(
    0,
    options.findIndex((o) => o.value === initial),
  )
  const draw = (first) => {
    if (!first) output.write(`\x1b[${options.length}A`)
    options.forEach((o, i) => output.write(`\x1b[2K${i === at ? '› ' : '  '}${o.label}\n`))
  }
  return new Promise((ok) => {
    output.write(`${label}\n`)
    draw(true)
    emitKeypressEvents(input)
    input.setRawMode?.(true)
    input.resume()
    const done = (value) => {
      input.off('keypress', onKey)
      input.setRawMode?.(false)
      input.pause()
      ok(value)
    }
    const onKey = (_, key) => {
      if (key?.ctrl && key.name === 'c') {
        input.setRawMode?.(false)
        process.exit(130)
      }
      if (key?.name === 'return' || key?.name === 'enter') return done(options[at].value)
      if (key?.name === 'up') at = (at + options.length - 1) % options.length
      else if (key?.name === 'down') at = (at + 1) % options.length
      else return
      draw(false)
    }
    input.on('keypress', onKey)
  })
}

/** Every choice, from flags, then the terminal if there is one, then the defaults. */
export async function resolveChoices(
  given,
  { interactive, yes = false, env = process.env, io } = {},
) {
  const choices = { ...given }
  for (const q of questions(env)) {
    if (q.when && !q.when(choices)) {
      choices[q.key] ??= q.skip ?? false
      continue
    }
    if (choices[q.key] !== undefined) continue
    if (interactive && !yes) choices[q.key] = await select(q, io)
    else choices[q.key] = q.sideEffect && !interactive && !yes ? false : q.default
  }
  return choices
}
