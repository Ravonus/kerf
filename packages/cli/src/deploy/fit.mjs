// Which hosts can run an app, and which one to suggest (research 46 §4). A finding is a need the host can't meet: an
// error when nothing on that host fixes it, a warning when it runs degraded or needs a paid add-on.

import { HOSTS } from './hosts.mjs'

const SERVERS = "`deploy: { target: 'fly' }` or `'render'`: a server that stays up"
const SPLIT =
  'or keep the pages here and run realtime on a small server (the split, `weft docs deploy`)'

/** What a disk need asks of a host, with the config that gives it one. */
function disk(h, need, cfg = {}, assume) {
  if (h.disk === 'none')
    return {
      severity: 'error',
      fix:
        need.what === 'a SQLite file'
          ? `${SERVERS}, with a volume or disk, or a hosted database here (Postgres on Neon or Supabase, Turso for SQLite)`
          : `${SERVERS}, with a volume or disk: this weft has no object store for uploads yet (research 46 §9)`,
    }
  const has = h.id === 'fly' ? cfg.fly?.volume : cfg.render?.disk
  if (has) return
  const add =
    h.id === 'fly'
      ? "`deploy.fly.volume: { name: 'data', sizeGb: 1 }` (billed)"
      : '`deploy.render.disk: { sizeGb: 1 }` (a paid plan)'
  return {
    severity: assume ? 'warning' : 'error',
    fix: `add ${add}: it mounts at \`/app/.data\`, where SQLite's default \`file:.data/app.db\` already is, and uploads go to \`.data/media\``,
  }
}

/**
 * @param {ReturnType<import('./needs.mjs').needsOf>} needs
 * @param {import('./hosts.mjs').Host} h
 * @param {{ deploy?: any, assume?: boolean, local?: boolean }} [options] `assume`: a paid add-on is a warning (the hosts list,
 *   before a target is chosen). `local`: the build is deployed from this machine.
 * @returns {{ host: string, fits: boolean, findings: { code: string, severity: string, file: string, why: string, fix: string }[] }}
 */
export function fit(needs, h, { deploy = {}, assume = false, local = false } = {}) {
  const findings = []
  const add = (code, severity, need, why, fix) =>
    findings.push({ code, severity, file: need.file, why, fix })
  if (needs.sockets && !h.sockets)
    add(
      'E001',
      'error',
      needs.sockets,
      `${needs.sockets.what} holds a WebSocket, and ${h.name} ends each process with its request: the page would load and never connect (R024)`,
      `${SERVERS}, or \`'cloudflare'\` (Durable Objects), ${SPLIT}`,
    )
  if (needs.required && !h.held)
    add(
      'E002',
      'error',
      needs.required,
      `${needs.required.what} needs a change feed that stays connected, and ${h.name} keeps no process between requests (R013)`,
      `${SERVERS}, run \`weft db listen\` on one with \`listener: 'external'\`, or drop \`required\``,
    )
  if (needs.sidecar && !h.sidecars)
    add(
      'E002',
      'error',
      needs.sidecar,
      `${needs.sidecar.what} is a second process next to the server, and ${h.name} runs only the server`,
      `${SERVERS} (the image runs both), or deploy the sidecar on its own and set \`rust.services.<name>.external: true\` with its \`WEFT_RUST_<NAME>_URL\``,
    )
  if (needs.native && h.kind === 'workers')
    add(
      'R104',
      'error',
      needs.native,
      `${needs.native.what} loads an addon or a \`.wasm\` file, and ${h.name} has no file system`,
      'use `remote()`, or a server host',
    )
  for (const key of ['sqlite', 'uploads']) {
    const need = needs[key]
    const d = need && disk(h, need, deploy, assume)
    if (d)
      add(
        'E003',
        d.severity,
        need,
        `${need.what} is kept on local disk, and ${h.disk === 'none' ? `${h.name}'s disk is gone after each request` : `${h.name} wipes it on each deploy without one`}`,
        d.fix,
      )
  }
  if (needs.feed && !h.held)
    add(
      'R014',
      'warning',
      needs.feed,
      `${needs.feed.what} needs a process that stays up: on ${h.name}, writes from outside the app won't reach \`.live()\``,
      `${SERVERS}, or \`weft db listen\` on one with \`listener: 'external'\``,
    )
  if (needs.memoryBus && h.many)
    add(
      'E009',
      'warning',
      needs.memoryBus,
      `${needs.memoryBus.what} reaches the clients of one instance, and ${h.name} runs many`,
      h.id === 'cloudflare'
        ? '`durableObjectBus` in `src/realtime.server.ts`'
        : '`weft add redis` or `weft add nats`, or `postgresBus({ url })` in `src/realtime.server.ts`',
    )
  if (needs.addons && local && h.prebuilt && process.platform !== 'linux')
    add(
      'E004',
      'warning',
      needs.addons,
      `${needs.addons.what} has a compiled addon, built here for ${process.platform}, and ${h.name} runs Linux`,
      "deploy from CI (`deploy.ci: 'github'` builds on Linux), or drop the addon",
    )
  return { host: h.id, fits: !findings.some((f) => f.severity === 'error'), findings }
}

/** Every host, fitted, and the one to suggest (research 46 §4), with why. */
export function hostsReport(needs, { deploy = {} } = {}) {
  const fits = HOSTS.map((h) => ({
    ...fit(needs, h, { deploy, assume: true }),
    name: h.name,
    kind: h.kind,
    cost: h.cost,
    pricing: h.pricing,
    deploys: h.deploys,
  }))
  return { fits, suggestion: suggest(needs, fits) }
}

/** @returns {{ host: string, why: string, alternative?: string }} */
export function suggest(needs, fits = HOSTS.map((h) => fit(needs, h, { assume: true }))) {
  const ok = (id) => fits.find((f) => f.host === id)?.fits
  const clean = (id) => ok(id) && !fits.find((f) => f.host === id).findings.length
  const held = needs.required || needs.sidecar || needs.feed
  const kept = needs.sqlite || needs.uploads
  if (!needs.sockets && !held && !kept) {
    if (clean('netlify'))
      return {
        host: 'netlify',
        why: 'nothing here needs a server that stays up: a CDN with functions behind it is the cheapest and fastest host',
        alternative: 'vercel',
      }
    if (ok('netlify'))
      return {
        host: 'netlify',
        why: 'nothing here needs a server that stays up, once the warnings are fixed',
        alternative: 'vercel',
      }
  }
  if (needs.sockets && !held && !kept && !needs.native && clean('cloudflare'))
    return {
      host: 'cloudflare',
      why: 'channels need a socket, and a Durable Object holds one for each room without a server to run',
      alternative: 'fly',
    }
  if (kept)
    return {
      host: 'fly',
      why: `${kept.what} needs a disk that lasts: a Fly volume is per machine and cheap`,
      alternative: 'render',
    }
  return {
    host: 'fly',
    why: `${(needs.sockets ?? held).what} needs a server that stays up, and Fly runs the app as it is. Render's free instance does too, but sleeps after 15 idle minutes`,
    alternative: 'render',
  }
}
