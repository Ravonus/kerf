#!/usr/bin/env node
// `gen plan` and `gen run` from a shell. The config module, kept by whoever runs it, gives the deny list, the
// reference folders, the guides, the distiller and the critic.
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { createBridgeAdapter } from './bridge.mjs'
import { createMockAdapter } from './mock.mjs'
import { planGen, runGen } from './run.mjs'
import { defaultCacheDir } from './store.mjs'

const USAGE =
  'usage: cli.mjs plan|run <recipe.gen.json> [--config <file.mjs>] [--max-calls N] [--max-wall-ms N] ' +
  '[--reroll a,b] [--adapter mock|bridge] [--bridge <url>]'

const fail = (message) => {
  console.error(message)
  process.exit(1)
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: 'string' },
    'max-calls': { type: 'string' },
    'max-wall-ms': { type: 'string' },
    reroll: { type: 'string' },
    adapter: { type: 'string', default: 'mock' },
    bridge: { type: 'string' },
  },
})
const [command, recipeFile] = positionals
if (!['plan', 'run'].includes(command) || !recipeFile) fail(USAGE)

const config = values.config ? await import(pathToFileURL(resolve(values.config)).href) : {}
const cacheDir = defaultCacheDir()
const adapters = {
  mock: () => createMockAdapter(),
  bridge: () => createBridgeAdapter({ base: values.bridge, cacheDir }),
}
if (!Object.hasOwn(adapters, values.adapter))
  fail(`gen: no adapter \`${values.adapter}\`; mock or bridge`)
const adapter = adapters[values.adapter]()
const { deny = [], reference = [], guides, distil, critic } = config

if (command === 'plan') {
  const { rows, totals } = await planGen({ recipeFile, cacheDir, adapter, deny, guides })
  for (const row of rows)
    console.log(
      [
        row.slot,
        row.adapter,
        row.op,
        `n=${row.n}`,
        row.state,
        `${row.calls} call(s)`,
        `${row.wallMs} ms`,
      ].join('  '),
    )
  console.log(
    `total: ${totals.calls} call(s), about ${totals.wallMs} ms, ${totals.seatTokens} seat tokens`,
  )
} else {
  const maxCalls = Number(values['max-calls'])
  const maxWallMs = Number(values['max-wall-ms'])
  if (
    !values['max-calls'] ||
    !values['max-wall-ms'] ||
    !Number.isSafeInteger(maxCalls) ||
    !(maxWallMs >= 0)
  )
    fail(
      'gen run: give both caps, --max-calls N and --max-wall-ms N; `gen plan` shows what a run would use',
    )
  if (typeof distil !== 'function') fail('gen run: the --config module must export `distil`')
  const reroll = values.reroll ? values.reroll.split(',').filter(Boolean) : []
  const result = await runGen({
    recipeFile,
    adapter,
    critic,
    distil,
    guides,
    reference,
    deny,
    maxCalls,
    maxWallMs,
    reroll,
    cacheDir,
    log: (line) => console.log(line),
  })
  console.log(
    `${result.calls} call(s), ${result.tokens.input} + ${result.tokens.output} seat tokens`,
  )
  if (result.stopped) fail(`stopped: ${result.stopped.reason}`)
  const failed = result.slots.filter((slot) => slot.state === 'failed')
  if (failed.length)
    fail(`failed: ${failed.map((slot) => `${slot.slot} (${slot.error})`).join(', ')}`)
}
