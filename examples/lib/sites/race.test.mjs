import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { raceOnce } from '../race.mjs'
import { liveHarness, manifest, pgUp } from './harness.mjs'

describe('against Postgres and a browser', { skip: !pgUp }, () => {
  const { up, fresh, getBrowser } = liveHarness()
  const race = (s, extra = {}) =>
    raceOnce({
      browser: getBrowser(),
      url: s.server.url,
      race: manifest.race,
      fresh: fresh(s),
      rows: () => s.db.rows(manifest.race.state),
      ...extra,
    })

  test('a correct client passes every race', async () => {
    const s = await up('good')
    try {
      const r = await race(s, { seed: 11 })
      assert.deepEqual(Object.keys(r).sort(), [
        'doubleSubmit',
        'invalidateDuring',
        'navigateDuring',
        'rollback',
        'toggles',
        'twoTabs',
      ])
      for (const [k, x] of Object.entries(r)) assert.ok(x.pass, `${k}: ${JSON.stringify(x.detail)}`)
    } finally {
      await s.stop()
    }
  })

  test('a client with no ordering guard fails them', async () => {
    const s = await up('bad', { FIXTURE_BUG: '1' })
    try {
      const r = await race(s, { seed: 11 })
      for (const k of ['rollback', 'twoTabs']) assert.equal(r[k].pass, false, `${k} should fail`)
      // Timing decides which reply lands last, so one sample can miss it: a bench takes several.
      let caught = !r.toggles.pass
      for (let i = 0; i < 4 && !caught; i++)
        caught = !(await race(s, { seed: i, only: ['toggles'] })).toggles.pass
      assert.ok(caught, 'toggles should fail')
    } finally {
      await s.stop()
    }
  })
})
