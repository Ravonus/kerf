import { existsSync, readFileSync } from 'node:fs'
import { cpus, hostname } from 'node:os'
import { join } from 'node:path'
import { historyFile as history } from '../lib/app.mjs'
import { pool } from '../../scripts/jobs.mjs'
import { attribute } from '../lib/attribute.mjs'
import { linesOfCode, packOnce, prepare, repoState } from '../lib/build.mjs'
import { diagnose } from '../lib/diagnose.mjs'
import { cookieHeader, signIn, sitePass } from '../lib/flow.mjs'
import { launchBrowser, loadPass } from '../lib/measure.mjs'
import { assertFresh, rssMB, startServer } from '../lib/serve.mjs'
import { spread } from '../lib/stats.mjs'
import { provision, serverInfo } from '../shared/pg/env.mjs'
import { summarise, timedSamples, lighthouseSamples } from './samples.mjs'

async function buildVariants({
  app,
  variants,
  jobs,
  work,
  runId,
  store,
  weft,
  buildRuns,
  opt,
  out,
  say,
  phase,
}) {
  const t = performance.now()
  await pool(variants, jobs, async (v) => {
    const { build, reused, key } = await prepare(app, v, {
      work,
      runId,
      store,
      weft: weft?.inputs,
      buildRuns,
      rebuild: opt.rebuild,
    })
    out[v.name] = {
      label: v.label,
      stack: v.stack.id,
      family: v.stack.family,
      pm: v.pm,
      build,
      buildReused: reused,
      key: key.slice(0, 16),
      lines: linesOfCode(v),
      weft: v.weft,
      pages: {},
    }
    say(
      `  ${v.name}: ${reused ? 'build reused' : `built in ${Math.round(build.med)} ms`}, ${out[v.name].lines} lines, ${v.fresh.hashes.size} assets fingerprinted`,
    )
  })
  phase('builds', t)
}

async function startVariants({ app, variants, servers, samples, out, sites, dbs, browser }) {
  for (const v of variants) {
    servers[v.name] = await startServer(v, app.pages[0].path)
    samples[v.name] = Object.fromEntries(app.pages.map((p) => [p.path, []]))
    out[v.name].bootMs = servers[v.name].bootMs
    if (app.db) {
      const site = (sites[v.name] = {
        db: dbs[v.name],
        url: servers[v.name].url,
        jar: [],
        cookies: (p) => (p?.signedOut ? [] : site.jar),
        login: async () => {
          if (app.login) site.jar = await signIn(browser, site.url, app.login)
        },
      })
      await site.login()
    }
  }
}

async function loadSamples({
  app,
  variants,
  out,
  opt,
  sites,
  servers,
  samples,
  samplesWanted,
  say,
  phase,
}) {
  const t = performance.now()
  for (const v of variants)
    for (const p of app.pages) out[v.name].pages[p.path] = summarise(p, samples[v.name][p.path])
  // Not a static build: its throughput would only be bench's own host.
  // One variant at a time: side by side, the load generators compete and every req/s reads about 25% low.
  if (!opt['no-load'])
    await pool(
      variants.filter((x) => x.start),
      1,
      async (v) => {
        for (const p of app.pages) {
          await sites[v.name]?.login()
          const s = [],
            plain = [],
            url = servers[v.name].url + p.path,
            cookie = cookieHeader(sites[v.name]?.cookies(p))
          await loadPass(url, { seconds: 0.5, cookie }) // warm, not counted
          for (let i = 0; i < samplesWanted; i++) {
            s.push(await loadPass(url, { cookie }))
            plain.push(await loadPass(url, { encoding: 'identity', seconds: 1, cookie }))
          }
          const errors = [...s, ...plain].reduce((n, x) => n + x.errors, 0),
            m = out[v.name].pages[p.path].metrics
          if (errors) say(`  ${v.name} ${p.path}: ${errors} failed requests under load`)
          m['server.rps'] = spread(s.map((x) => x.rps))
          m['server.p95'] = spread(s.map((x) => x.p95))
          m['server.rpsPlain'] = spread(plain.map((x) => x.rps))
          out[v.name].pages[p.path].loadErrors = errors
          out[v.name].pages[p.path].loadEncoding = s[0].served
        }
        await assertFresh(v, servers[v.name])
        out[v.name].rssMB = rssMB(servers[v.name])
      },
    )
  phase('server load', t)
}

async function siteSamples({
  app,
  variants,
  sites,
  servers,
  browser,
  samplesWanted,
  out,
  say,
  phase,
}) {
  const t = performance.now()
  // Last, and one variant at a time: these reset the database and set the proxy's RTT.
  if (app.db) {
    await pool(variants, 1, (v) =>
      sitePass({
        app,
        v,
        site: sites[v.name],
        server: servers[v.name],
        browser,
        samples: samplesWanted,
        out: out[v.name],
        say,
      }),
    )
    for (const v of variants) await assertFresh(v, servers[v.name])
    phase('database, flows, races', t)
  }
}

async function finish({ app, variants, out, t0, samplesWanted, jobs, samples, say }) {
  for (const v of variants) if (v.maps) out[v.name].split = attribute(v, v.maps, out[v.name].pages)
  say(`  ${app.name}: ${((performance.now() - t0) / 1000).toFixed(0)} s in all`)
  const state = repoState(),
    line = {
      at: new Date().toISOString(),
      app: app.name,
      ...state,
      runs: samplesWanted,
      jobs,
      seconds: Math.round((performance.now() - t0) / 1000),
      cores: cpus().length,
      host: hostname(),
      loadMax: Math.max(
        ...Object.values(samples).flatMap((p) =>
          Object.values(p).flatMap((l) => l.map((s) => s.load)),
        ),
      ),
    }
  const prev = existsSync(history)
    ? readFileSync(history, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .findLast((l) => l.app === app.name && Object.keys(l.variants).some((k) => k in out))
    : null
  const run = {
    ...line,
    label: app.label,
    note: app.note,
    pages: app.pages.map((p) => p.path),
    baseline: app.baseline,
    variants: out,
    ...(app.db && { db: await serverInfo() }),
  }
  run.diagnosis = diagnose(run, prev)
  return {
    run,
    line: {
      ...line,
      variants: Object.fromEntries(
        Object.entries(out).map(([k, r]) => [
          k,
          {
            label: r.label,
            stack: r.stack,
            key: r.key,
            build: r.build,
            lines: r.lines,
            weft: r.weft?.tgz,
            pages: Object.fromEntries(Object.entries(r.pages).map(([p, x]) => [p, x.metrics])),
          },
        ]),
      ),
    },
  }
}

export async function benchApp(app, config) {
  const { opt, say, work, store, samplesWanted, buildRuns, jobs, load } = config
  const t0 = performance.now(),
    runId = Date.now().toString(36),
    only = opt.only?.split(','),
    variants = app.variants.filter((v) => !only || only.includes(v.name))
  const phase = (name, since) =>
    say(`  ${name}: ${((performance.now() - since) / 1000).toFixed(0)} s`)
  say(
    `\n${app.name}: ${variants.map((v) => `${v.name} (${v.stack.id})`).join(', ')}; ${app.pages.length} pages, ${samplesWanted} samples, ${jobs} jobs`,
  )
  const out = {},
    dbs = {},
    sites = {}
  if (app.db)
    for (const v of variants) {
      dbs[v.name] = await provision(app.name, v.name, { rtt: app.db.rtt[0] })
      v.dbEnv = dbs[v.name].env
    }
  const weft = variants.some((v) => v.tarballs)
    ? await packOnce(store, join(work, 'pack.log'))
    : null
  if (weft?.packed) say('  packed this checkout')
  await buildVariants({
    app,
    variants,
    jobs,
    work,
    runId,
    store,
    weft,
    buildRuns,
    opt,
    out,
    say,
    phase,
  })
  const browser = await launchBrowser(),
    servers = {},
    samples = {}
  try {
    await startVariants({ app, variants, servers, samples, out, sites, dbs, browser })
    await timedSamples({
      app,
      variants,
      samplesWanted,
      samples,
      jobs,
      servers,
      browser,
      sites,
      phase,
      load,
    })
    await lighthouseSamples({ app, variants, samples, jobs, servers, sites, phase, load })
    await loadSamples({
      app,
      variants,
      out,
      opt,
      sites,
      servers,
      samples,
      samplesWanted,
      say,
      phase,
    })
    await siteSamples({ app, variants, sites, servers, browser, samplesWanted, out, say, phase })
  } finally {
    await browser.close()
    for (const s of Object.values(servers)) await s.stop()
    for (const d of Object.values(dbs)) await d.stop()
  }
  return finish({ app, variants, out, t0, samplesWanted, jobs, samples, say })
}
