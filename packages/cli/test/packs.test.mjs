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
const packs = readdirSync(packages).filter(d => /^(realtime|db|plugin-pay)-|^pay$/.test(d))

const load = async dir => {
  const mod = await import(pathToFileURL(join(packages, dir, 'plugin.mjs')).href)
  const plugin = mod.default()
  const manifest = plugin.contribute({ command: 'check', mode: 'development', root: packages })
  return { plugin, manifest }
}

test('the list of packs', () => {
  expect(packs.sort()).toEqual(['db-dynamodb', 'db-firestore', 'db-kysely', 'db-mongo', 'db-prisma', 'db-sql', 'pay', 'plugin-pay-stripe', 'realtime-durable-object', 'realtime-livekit', 'realtime-nats', 'realtime-redis', 'realtime-socketio', 'realtime-webrtc'])
})

describe.each(packs)('%s', dir => {
  test('declares what it reaches, and the audit finds nothing undeclared', async () => {
    const { plugin, manifest } = await load(dir)
    expect(plugin.name).toBe(`@weft/${dir}`)
    if (dir !== 'pay') expect(grants(plugin.permissions).length).toBeGreaterThan(0) // pay reaches nothing itself: its rail does
    const found = audit(packages, join(packages, dir), { manifest, permissions: plugin.permissions })
    expect(found.undeclared).toEqual([])
  })

  test('has an AGENTS section and a conformance test', async () => {
    const { manifest } = await load(dir)
    expect(manifest.agents.text.length).toBeLessThanOrEqual(1024)
    expect(existsSync(join(packages, dir, 'test'))).toBe(true)
  })
})

test('pay is built only from public parts: nothing in weft, start or the CLI names it', async () => {
  const stray = execFileSync('git', ['grep', '-lE', "@weft/pay|PayRail|entitlementTag|definePay|fakePay", '--', 'weft/src', 'weft/vite.mjs', 'start/src', 'cli/src'], { cwd: packages, encoding: 'utf8' }).trim().split('\n').filter(f => f && !['cli/src/add.mjs', 'cli/src/docs.mjs'].includes(f)) // an alias in `weft add`, and a line pointing at the walkthrough
  expect(stray).toEqual([])
})

test('a rail provides `pay.rail`, keyed, and only on the server', async () => {
  const stripe = await load('plugin-pay-stripe')
  expect(stripe.plugin.provides).toEqual([{ slot: 'pay.rail', key: 'stripe' }])
  expect(Object.keys(stripe.manifest.provides[0].sides)).toEqual(['server'])
  expect(bindSlots({ plugins: [stripe.plugin] }, (code, why) => { throw new Error(`${code} ${why}`) })['pay.rail']).toEqual({ stripe: '@weft/plugin-pay-stripe' })
})

test('a bus provides `realtime.bus`, a list source `db.adapter`, keyed', async () => {
  const redis = await load('realtime-redis'), mongo = await load('db-mongo'), sql = await load('db-sql')
  expect(redis.plugin.provides).toEqual(['realtime.bus'])
  expect(mongo.plugin.provides).toEqual([{ slot: 'db.adapter', key: 'mongo' }])
  const slots = bindSlots({ plugins: [redis.plugin, mongo.plugin, sql.plugin] }, (code, why) => { throw new Error(`${code} ${why}`) })
  expect(slots['realtime.bus']).toBe('@weft/realtime-redis')
  expect(slots['db.adapter']).toMatchObject({ mongo: '@weft/db-mongo', sql: '@weft/db-sql' })
})
