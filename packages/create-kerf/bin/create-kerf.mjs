#!/usr/bin/env node
// create-kerf [dir] [--template landing|todo|admin|catalog] [--ui veneer|headless|tailwind|none] [--db sqlite|postgres|mysql|none] [--layer drizzle|prisma|native] [--[no-]auth] [--auth-provider better-auth|custom] [--runtime node|bun|deno]
//   [--config ts|json|yaml] [--pm npm|pnpm|bun|deno|yarn] [--[no-]git] [--[no-]install] [--name <name>] [--tarballs <dir>] [--yes]
// In a terminal it asks what the flags don't answer; --yes, or no terminal, takes the defaults.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import {
  CONFIGS,
  DB,
  LAYERS,
  RUNTIMES,
  scaffold,
  TEMPLATES,
  UI,
  withTemplate,
} from '../src/index.mjs'
import { resolveChoices } from '../src/wizard.mjs'
import { pin, pinWorkspace } from '../scripts/tarballs.mjs'

const usage = `Usage: npm create kerf -- [dir] [--template ${TEMPLATES.join('|')}] [--ui ${UI.join('|')}] [--db ${DB.join('|')}] [--layer ${LAYERS.join('|')}] [--[no-]auth] [--auth-provider better-auth|custom] [--runtime ${RUNTIMES.join('|')}] [--config ${CONFIGS.join('|')}] [--pm <manager>] [--[no-]git] [--[no-]install] [--name <name>] [--tarballs <dir>] [--yes]`
const string = { type: 'string' },
  boolean = { type: 'boolean' }
const { values, positionals } = parseArgs({
  allowPositionals: true,
  allowNegative: true,
  options: {
    template: string,
    ui: string,
    db: string,
    layer: string,
    auth: boolean,
    'auth-provider': string,
    runtime: string,
    config: string,
    pm: string,
    git: boolean,
    install: boolean,
    name: string,
    tarballs: string,
    yes: { ...boolean, short: 'y' },
    help: { ...boolean, short: 'h' },
  },
})
const interactive = process.stdin.isTTY && process.stdout.isTTY
if (values.help || positionals.length > 1 || (!positionals.length && !interactive)) {
  console.log(usage)
  process.exit(values.help ? 0 : 1)
}

async function directory() {
  if (positionals.length) return positionals[0]
  if (values.yes) return 'my-kerf-app'
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question('App directory (my-kerf-app) ')
  rl.close()
  return answer.trim() || 'my-kerf-app'
}

/** The app is already written, so a failure here leaves a step for later; a failed install still fails the command. */
function step(what, command, args, cwd) {
  try {
    execFileSync(command, args, {
      cwd,
      stdio: ['ignore', 'ignore', 'inherit'],
      shell: process.platform === 'win32',
    }) // npm is npm.cmd there
    return true
  } catch {
    console.error(
      `create-kerf: ${what} didn't finish; run \`${[command, ...args].join(' ')}\` yourself.`,
    )
    return false
  }
}

try {
  const { yes, help: _help, name, tarballs, 'auth-provider': authProvider, ...flags } = values
  if (authProvider && !['better-auth', 'custom'].includes(authProvider))
    throw new Error('--auth-provider must be better-auth or custom')
  if (authProvider) flags.auth = authProvider === 'custom' ? 'custom' : true
  const where = await directory()
  const dir = resolve(where)
  const choices = await resolveChoices(withTemplate(flags), {
    interactive,
    yes,
    io: { input: process.stdin, output: process.stdout },
  })
  const { files } = scaffold(dir, { ...choices, ...(name && { name }) })
  // Before the install: a checkout's packages aren't on npm, so `local.mjs new` needs them wired in from the start.
  if (tarballs) {
    const file = join(dir, 'package.json')
    const map = JSON.parse(readFileSync(join(tarballs, 'tarballs.json'), 'utf8'))
    writeFileSync(file, JSON.stringify(pin(JSON.parse(readFileSync(file, 'utf8')), map), null, 2))
    pinWorkspace(dir, map)
  }
  console.log(`\nCreated ${files.length} files in ${dir}`)
  if (choices.git) step('git init', 'git', ['init', '--quiet'], dir)
  const installed = choices.install && step('The install', choices.pm, ['install'], dir)
  const kerf = {
    npm: 'npx kerf',
    pnpm: 'pnpm exec kerf',
    bun: 'bunx --bun kerf',
    deno: 'deno run -A npm:@kerf/cli',
    yarn: 'yarn kerf',
  }[choices.pm]
  // AGENTS.md comes from the kerf just installed, so it always matches the compiler the app runs.
  if (installed) {
    const [command, ...args] = kerf.split(' ')
    step('AGENTS.md', command, [...args, 'agents-md'], dir)
  }
  console.log(
    `\n  cd ${where}${installed ? '' : `\n  ${choices.pm} install\n  ${kerf} agents-md`}${choices.db === 'none' || choices.template ? '' : `\n  ${kerf} db generate`}\n  ${kerf} dev\n`,
  )
  if (choices.install && !installed) process.exitCode = 1
} catch (e) {
  console.error(`create-kerf: ${e.message}`)
  process.exit(1)
}
