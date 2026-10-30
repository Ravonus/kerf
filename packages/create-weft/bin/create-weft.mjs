#!/usr/bin/env node
// create-weft [dir] [--ui warp|headless|tailwind|none] [--db sqlite|postgres|mysql|none] [--layer drizzle|prisma|native] [--[no-]auth] [--auth-provider better-auth|custom] [--runtime node|bun|deno]
//   [--config ts|json|yaml] [--pm npm|pnpm|bun|yarn] [--[no-]git] [--[no-]install] [--name <name>] [--tarballs <dir>] [--yes]
// In a terminal it asks what the flags don't answer; --yes, or no terminal, takes the defaults.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { CONFIGS, DB, LAYERS, RUNTIMES, scaffold, UI } from '../src/index.mjs'
import { resolveChoices } from '../src/wizard.mjs'
import { pin } from '../scripts/tarballs.mjs'

const usage = `Usage: create-weft [dir] [--ui ${UI.join('|')}] [--db ${DB.join('|')}] [--layer ${LAYERS.join('|')}] [--[no-]auth] [--auth-provider better-auth|custom] [--runtime ${RUNTIMES.join('|')}] [--config ${CONFIGS.join('|')}] [--pm <manager>] [--[no-]git] [--[no-]install] [--name <name>] [--tarballs <dir>] [--yes]`
const string = { type: 'string' }, boolean = { type: 'boolean' }
const { values, positionals } = parseArgs({
  allowPositionals: true,
  allowNegative: true,
  options: { ui: string, db: string, layer: string, auth: boolean, 'auth-provider': string, runtime: string, config: string, pm: string, git: boolean, install: boolean, name: string, tarballs: string, yes: { ...boolean, short: 'y' }, help: { ...boolean, short: 'h' } },
})
const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
if (values.help || positionals.length > 1 || (!positionals.length && !interactive)) {
  console.log(usage)
  process.exit(values.help ? 0 : 1)
}

async function directory() {
  if (positionals.length) return positionals[0]
  if (values.yes) return 'my-weft-app'
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question('App directory (my-weft-app) ')
  rl.close()
  return answer.trim() || 'my-weft-app'
}

/** Git and the install are conveniences: the app is already written, so a failure here only leaves a step for later. */
function step(what, command, args, cwd) {
  try {
    execFileSync(command, args, { cwd, stdio: ['ignore', 'ignore', 'inherit'] })
    return true
  } catch {
    console.error(`create-weft: ${what} didn't finish; run \`${[command, ...args].join(' ')}\` yourself.`)
    return false
  }
}

try {
  const { yes, help, name, tarballs, 'auth-provider': authProvider, ...flags } = values
  if (authProvider && !['better-auth', 'custom'].includes(authProvider)) throw new Error('--auth-provider must be better-auth or custom')
  if (authProvider) flags.auth = authProvider === 'custom' ? 'custom' : true
  const where = await directory()
  const dir = resolve(where)
  const choices = await resolveChoices(flags, { interactive, yes, io: { input: process.stdin, output: process.stdout } })
  const { files } = scaffold(dir, { ...choices, ...(name && { name }) })
  // Before the install: a checkout's packages aren't on npm, so `local.mjs new` needs them wired in from the start.
  if (tarballs) {
    const file = join(dir, 'package.json')
    writeFileSync(file, JSON.stringify(pin(JSON.parse(readFileSync(file, 'utf8')), JSON.parse(readFileSync(join(tarballs, 'tarballs.json'), 'utf8'))), null, 2))
  }
  console.log(`\nCreated ${files.length} files in ${dir}`)
  if (choices.git) step('git init', 'git', ['init', '--quiet'], dir)
  const installed = choices.install && step('The install', choices.pm, ['install'], dir)
  const run = choices.pm === 'npm' ? 'npx' : choices.pm === 'pnpm' ? 'pnpm exec' : choices.pm === 'bun' ? 'bunx' : 'yarn'
  console.log(`\n  cd ${where}${installed ? '' : `\n  ${choices.pm} install`}${choices.db === 'none' ? '' : `\n  ${run} weft db generate`}\n  ${run} weft dev\n`)
} catch (e) {
  console.error(`create-weft: ${e.message}`)
  process.exit(1)
}
