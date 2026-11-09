import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { raceOnce } from '../race.mjs'
import { liveHarness, manifest, pgUp } from './harness.mjs'

const runRace = (h, s, extra = {}) =>
  raceOnce({
    browser: h.getBrowser(),
    url: s.server.url,
    race: manifest.race,
    fresh: h.fresh(s),
    rows: () => s.db.rows(manifest.race.state),
    ...extra,
  })

async function correctClient(h) {
  const s = await h.up('good')
  try {
    const r = await runRace(h, s, { seed: 11 })
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
}

async function unguardedClient(h) {
  const s = await h.up('bad', { FIXTURE_BUG: '1' })
  try {
    const r = await runRace(h, s, { seed: 11 })
    for (const k of ['rollback', 'twoTabs']) assert.equal(r[k].pass, false, `${k} should fail`)
    // Timing decides which reply lands last, so one sample can miss it: a bench takes several.
    let caught = !r.toggles.pass
    for (let i = 0; i < 4 && !caught; i++)
      caught = !(await runRace(h, s, { seed: i, only: ['toggles'] })).toggles.pass
    assert.ok(caught, 'toggles should fail')
  } finally {
    await s.stop()
  }
}

describe('against Postgres and a browser', { skip: !pgUp }, () => {
  const h = liveHarness()
  test('a correct client passes every race', () => correctClient(h))
  test('a client with no ordering guard fails them', () => unguardedClient(h))
})
