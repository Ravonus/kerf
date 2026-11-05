// Every realtime and db pack through the trust tooling: each says what it reaches, and the audit finds nothing more
// (PLAN 3c). Names and provided slots are held here too, so a pack can't quietly stop being one.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { audit, grants } from '../src/trust.mjs'
import { bindSlots } from '../src/slots.mjs'

const packages = fileURLToPath(new URL('../../', import.meta.url))
const realtime = readdirSync(packages).filter((d) => d.startsWith('realtime-'))
/** Plugin name, its package's directory, and the entry that defines it. A package can hold several. */
const packs = [
  ...realtime.map((d) => [`@weft-js/${d}`, d, 'plugin.mjs']),
  ...['sql', 'kysely', 'prisma', 'mongo', 'dynamodb', 'firestore'].map((d) => [
    `@weft-js/db/${d}`,
    'db',
    `plugins/${d}.mjs`,
  ]),
  ['@weft-js/pay', 'pay', 'plugin.mjs'],
  ['@weft-js/pay/stripe', 'pay', 'stripe-plugin.mjs'],
]

const load = async (name: string) => {
  const [, dir, file] = packs.find((p) => p[0] === name)!
  const mod = await import(pathToFileURL(join(packages, dir!, file!)).href)
  const plugin = mod.default()
  const manifest = plugin.contribute({ command: 'check', mode: 'development', root: packages })
  return { plugin, manifest }
}

test('the list of packs', () => {
  expect(realtime.sort()).toEqual([
    'realtime-durable-object',
    'realtime-livekit',
    'realtime-nats',
    'realtime-redis',
    'realtime-socketio',
    'realtime-webrtc',
  ])
})

describe.each(packs)('%s', (name, dir) => {
  test('declares what it reaches, and the audit finds nothing undeclared', async () => {
    const { plugin, manifest } = await load(name)
    expect(plugin.name).toBe(name)
    if (name !== '@weft-js/pay') expect(grants(plugin.permissions).length).toBeGreaterThan(0) // pay reaches nothing itself: its rail does
    const found = audit(packages, join(packages, dir), {
      name,
      manifest,
      permissions: plugin.permissions,
    })
    expect(found.undeclared).toEqual([])
  })

  test('has an AGENTS section and a conformance test', async () => {
    const { manifest } = await load(name)
    expect(manifest.agents.text.length).toBeLessThanOrEqual(1024)
    expect(existsSync(join(packages, dir, 'test'))).toBe(true)
  })
})

test('pay is built only from public parts: nothing in weft, start or the CLI names it', () => {
  const stray = execFileSync(
    'git',
    [
      'grep',
      '-lE',
      '@weft-js/pay|PayRail|entitlementTag|definePay\\b|fakePay',
      '--',
      'core/src',
      'core/vite.mjs',
      'start/src',
      'cli/src',
    ],
    { cwd: packages, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter((f) => f && !['cli/src/add.mjs', 'cli/src/docs.mjs'].includes(f)) // an alias in `weft add`, and a line pointing at the walkthrough
  expect(stray).toEqual([])
})

test('a rail provides `pay.rail`, keyed, and only on the server', async () => {
  const stripe = await load('@weft-js/pay/stripe')
  expect(stripe.plugin.provides).toEqual([{ slot: 'pay.rail', key: 'stripe' }])
  expect(Object.keys(stripe.manifest.provides[0].sides)).toEqual(['server'])
  expect(
    bindSlots({ plugins: [stripe.plugin] }, (code, why) => {
      throw new Error(`${code} ${why}`)
    })['pay.rail'],
  ).toEqual({ stripe: '@weft-js/pay/stripe' })
})

test('a bus provides `realtime.bus`, a list source `db.adapter`, keyed', async () => {
  const redis = await load('@weft-js/realtime-redis'),
    mongo = await load('@weft-js/db/mongo'),
    sql = await load('@weft-js/db/sql')
  expect(redis.plugin.provides).toEqual(['realtime.bus'])
  expect(mongo.plugin.provides).toEqual([{ slot: 'db.adapter', key: 'mongo' }])
  const slots = bindSlots({ plugins: [redis.plugin, mongo.plugin, sql.plugin] }, (code, why) => {
    throw new Error(`${code} ${why}`)
  })
  expect(slots['realtime.bus']).toBe('@weft-js/realtime-redis')
  expect(slots['db.adapter']).toMatchObject({ mongo: '@weft-js/db/mongo', sql: '@weft-js/db/sql' })
})
