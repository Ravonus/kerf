import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { clone, contentHash, ensureSeed, measureRtt, psql } from '../../shared/pg/env.mjs'
import { liveHarness, pgUp } from './harness.mjs'

describe('against Postgres and a browser', { skip: !pgUp }, () => {
  const { up } = liveHarness()

  test('a clone holds exactly the seed, a reset brings it back, and two seed builds agree', async () => {
    const a = await ensureSeed(),
      name = 'weft_bench_test_clone',
      again = `${a}_t`
    await clone(name)
    const seeded = await contentHash(name)
    await psql(name, "update orders set status = 'x'")
    assert.notEqual(await contentHash(name), seeded)
    await clone(name)
    assert.equal(await contentHash(name), seeded)
    await ensureSeed({ name: again })
    assert.equal(await contentHash(again), seeded)
    await psql('postgres', `drop database ${again}`)
    await psql('postgres', `drop database ${name}`)
  })

  test('the proxy adds its RTT to SELECT 1, and a server keeps working through a reset', async () => {
    const s = await up('rtt')
    try {
      await s.db.rtt(40)
      const m = await measureRtt(s.db.name, s.db.proxy.port)
      assert.ok(m.added > 38 && m.added < 46, `added ${m.added}`)
      await s.db.rtt(2)
      await s.site.login()
      await s.db.reset()
      await s.site.login()
    } finally {
      await s.stop()
    }
  })
})
