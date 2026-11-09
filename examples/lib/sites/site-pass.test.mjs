import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { sitePass } from '../flow.mjs'
import { SITE_METRICS } from '../stats.mjs'
import { liveHarness, manifest, pgUp } from './harness.mjs'

const FILLED = [
  'db.queries',
  'db.roundTrips',
  'server.ttfb.p50',
  'server.flush.head',
  'flow.nav.url.cold',
  'flow.nav.data.second',
  'flow.interaction.worst',
  'flow.mutate.confirmed',
  'flow.mutate.requests',
  'bytes.html.50.br',
  'bytes.data.50.raw',
]
const EMPTY = [
  'flow.nav.url.cold',
  'flow.mutate.optimistic',
  'flow.interaction.streaming',
  'bytes.html.500.br',
]

function assertSiteMetrics(out) {
  const page = out.pages['/todos'].metrics,
    login = out.pages['/login'].metrics
  for (const k of SITE_METRICS) {
    assert.ok(k in page, k)
    assert.ok(k in login, k)
  }
  for (const k of FILLED) assert.ok(page[k]?.med > 0, `${k}: ${JSON.stringify(page[k])}`)
  for (const k of EMPTY) assert.equal(login[k], null, k)
  assert.equal(page['flow.interaction.streaming'], null)
  assert.ok(page['db.queries'].med >= 2, 'the fixture runs two queries a page')
  assert.ok(page['db.roundTrips'].med > 1, `round trips ${page['db.roundTrips'].med}`)
  assert.equal(out.pages['/todos'].canary.label, 'live')
  assert.equal(out.pages['/login'].canary.label, 'unchecked')
  assert.equal(out.db.queries, 'pg_stat_statements')
}

describe('against Postgres and a browser', { skip: !pgUp }, () => {
  const { up, getBrowser } = liveHarness()

  test('sitePass fills what applies and leaves the rest null', async () => {
    const s = await up('site'),
      out = {
        pages: {
          '/login': { metrics: {}, fresh: { samples: 1 } },
          '/todos': { metrics: {}, fresh: { samples: 1 } },
        },
      }
    try {
      await s.site.login()
      await sitePass({
        app: { ...manifest, race: null },
        v: { name: 'site' },
        site: s.site,
        server: s.server,
        browser: getBrowser(),
        samples: 1,
        out,
      })
    } finally {
      await s.stop()
    }
    assertSiteMetrics(out)
  })
})
