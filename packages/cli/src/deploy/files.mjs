// The files a host needs, written by `weft deploy init` and compared by `weft check` (research 46 §7). Each text file
// starts with `# weft deploy init <target>, sha <hash>`, the hash of what follows: a matching hash that differs from what
// init writes now is stale (E006), and a hash that doesn't match was edited by hand, so weft leaves it alone.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { host, presetFor } from './hosts.mjs'

/** The lockfile's manager: how the image and the workflow install. */
const MANAGERS = [
  ['pnpm-lock.yaml', { name: 'pnpm', install: 'corepack enable && pnpm install --frozen-lockfile', x: 'pnpm exec', cache: 'pnpm' }],
  ['yarn.lock', { name: 'yarn', install: 'corepack enable && yarn install --immutable', x: 'yarn', cache: 'yarn' }],
  ['bun.lock', { name: 'bun', install: 'bun install --frozen-lockfile', x: 'bunx', cache: '' }],
  ['package-lock.json', { name: 'npm', install: 'npm ci', x: 'npx', cache: 'npm' }],
]
export const managerOf = root => (MANAGERS.find(([lock]) => existsSync(join(root, lock))) ?? [null, { name: 'npm', install: 'npm install', x: 'npx', cache: '' }])[1]

/** Where a server host keeps what must last: SQLite's default `file:.data/app.db` lands on it unchanged. */
export const DATA = '/app/.data'

const sha = body => createHash('sha256').update(body).digest('hex').slice(0, 12)
const stamp = (target, body) => `# weft deploy init ${target}, sha ${sha(body)}\n${body}`
const STAMP = /^# weft deploy init (\w+), sha ([0-9a-f]{12})\n/

const IMAGES = { node: 'node:26-slim', bun: 'oven/bun:1-slim', deno: 'denoland/deno:latest' }
const RUN = { node: '["node", ".output/server/index.mjs"]', bun: '["bun", "run", ".output/server/index.mjs"]', deno: '["deno", "run", "-A", ".output/server/index.mjs"]' }

/** A two-stage image: build with the lockfile's manager, run the server. A sidecar needs cargo to build and `weft start` to run. */
function dockerfile({ runtime, manager, needs }) {
  const rust = needs.sidecar || needs.native
  const lines = [
    `FROM ${IMAGES.node} AS build`,
    'WORKDIR /app',
    ...(rust ? ['RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates build-essential && curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal', 'ENV PATH=/root/.cargo/bin:$PATH'] : []),
    'COPY . .',
    `RUN ${manager.install}`,
    `RUN ${manager.x} weft build --preset ${presetFor({}, runtime)}`,
    '',
    `FROM ${needs.sidecar ? IMAGES.node : IMAGES[runtime] ?? IMAGES.node}`,
    'WORKDIR /app',
    'ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080',
    // `weft start` runs each sidecar next to the server; without one the server is all there is
    ...(needs.sidecar ? ['COPY --from=build /app ./', 'EXPOSE 8080', `CMD ["${manager.x.split(' ')[0]}", ${manager.x.includes(' ') ? `"${manager.x.split(' ')[1]}", ` : ''}"weft", "start"]`] : ['COPY --from=build /app/.output ./.output', 'EXPOSE 8080', `CMD ${RUN[runtime] ?? RUN.node}`]),
  ]
  return `${lines.join('\n')}\n`
}

const DOCKERIGNORE = 'node_modules\n.output\n.weft/*\n!.weft/plugins.lock.json\n.env\n.env.*\n.git\n.netlify\n.vercel\ntarget\n'

function flyToml({ deploy, needs }) {
  const fly = deploy.fly ?? {}
  const held = needs.required || needs.feed || needs.sidecar
  const lines = [
    `app = ${JSON.stringify(fly.app ?? 'my-app')}`,
    `primary_region = ${JSON.stringify(fly.region ?? 'iad')}`,
    '',
    '[env]',
    '  PORT = "8080"',
    ...(needs.uploads && fly.volume ? [`  WEFT_MEDIA_DIR = "${fly.volume.path ?? DATA}/media"`] : []),
    '',
    '[http_service]',
    '  internal_port = 8080',
    '  force_https = true',
    '  auto_stop_machines = "stop"',
    '  auto_start_machines = true',
    // a change feed is a listener: a stopped machine hears nothing
    `  min_machines_running = ${held ? 1 : 0}`,
    ...(fly.volume ? ['', '[[mounts]]', `  source = ${JSON.stringify(fly.volume.name ?? 'data')}`, `  destination = ${JSON.stringify(fly.volume.path ?? DATA)}`, `  initial_size = "${fly.volume.sizeGb ?? 1}gb"`] : []),
    '',
    '[[vm]]',
    `  memory = ${JSON.stringify(fly.memory ?? '512mb')}`,
  ]
  return `${lines.join('\n')}\n`
}

function renderYaml({ deploy, needs }) {
  const r = deploy.render ?? {}
  const lines = [
    'services:',
    '  - type: web',
    `    name: ${r.service ?? 'my-app'}`,
    '    runtime: docker',
    `    plan: ${r.plan ?? (r.disk ? 'starter' : 'free')}`,
    `    region: ${r.region ?? 'oregon'}`,
    // the workflow deploys once `weft check` passes, through the deploy hook
    '    autoDeploy: false',
    '    healthCheckPath: /',
    '    envVars:',
    '      - key: NODE_ENV',
    '        value: production',
    ...(needs.uploads && r.disk ? ['      - key: WEFT_MEDIA_DIR', `        value: ${r.disk.path ?? DATA}/media`] : []),
    ...(r.disk ? ['    disk:', '      name: data', `      mountPath: ${r.disk.path ?? DATA}`, `      sizeGB: ${r.disk.sizeGb ?? 1}`] : []),
  ]
  return `${lines.join('\n')}\n`
}

const netlifyToml = ({ manager }) => `[build]\n  command = "${manager.x} weft build --preset netlify"\n  publish = "dist"\n\n[build.environment]\n  NODE_VERSION = "26"\n`

const vercelJson = ({ manager }) => `${JSON.stringify({ $schema: 'https://openapi.vercel.sh/vercel.json', framework: null, installCommand: manager.install.replace(/^corepack enable && /, ''), buildCommand: `${manager.x} weft build --preset vercel` }, null, 2)}\n`

const wranglerToml = ({ deploy }) => `name = ${JSON.stringify(deploy.cloudflare?.name ?? 'my-app')}\ncompatibility_flags = ["nodejs_compat"]\n`

/** The workflow: on push to the branch, check and deploy to production; on a pull request, a preview where the host has one. */
function workflow({ target, deploy, manager }) {
  const h = host(target)
  const previews = h.kind !== 'server'
  const node = manager.name === 'bun' ? ['      - uses: oven-sh/setup-bun@v2'] : ['      - uses: actions/setup-node@v4', '        with:', '          node-version: 26', ...(manager.cache ? [`          cache: ${manager.cache}`] : [])]
  const lines = [
    'name: weft deploy',
    'on:',
    '  push:',
    `    branches: [${deploy.branch ?? 'main'}]`,
    ...(previews ? ['  pull_request:'] : []),
    'permissions:',
    '  contents: read',
    'concurrency:',
    // oxlint-disable-next-line no-template-curly-in-string -- a GitHub Actions expression, not a JS template
    '  group: weft-deploy-${{ github.ref }}',
    '  cancel-in-progress: true',
    'jobs:',
    '  deploy:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    ...node,
    ...(target === 'fly' ? ['      - uses: superfly/flyctl-actions/setup-flyctl@master'] : []),
    `      - run: ${manager.install}`,
    `      - run: ${manager.x} weft check`,
    // oxlint-disable-next-line no-template-curly-in-string -- a GitHub Actions expression, not a JS template
    `      - run: ${manager.x} weft deploy --yes${previews ? " ${{ github.event_name == 'push' && '--prod' || '' }}" : ' --prod'}`,
    '        env:',
    ...h.env.map(k => `          ${k}: \${{ secrets.${k} }}`),
  ]
  return `${lines.join('\n')}\n`
}

const WORKFLOW = '.github/workflows/weft-deploy.yml'

/**
 * What `weft deploy init <target>` writes, as `{ path, text }`, every text one stamped.
 * @param {{ target: string, deploy: any, needs: any, runtime: string, manager: any }} ctx
 */
export function filesFor(ctx) {
  const { target } = ctx
  const out = []
  const text = (path, body) => out.push({ path, text: stamp(target, body) })
  if (target === 'netlify') text('netlify.toml', netlifyToml(ctx))
  if (target === 'vercel') out.push({ path: 'vercel.json', text: vercelJson(ctx), json: true })
  if (target === 'cloudflare') text('wrangler.toml', wranglerToml(ctx))
  if (target === 'fly') text('fly.toml', flyToml(ctx))
  if (target === 'render') text('render.yaml', renderYaml(ctx))
  if (target === 'fly' || target === 'render') {
    text('Dockerfile', dockerfile(ctx))
    out.push({ path: '.dockerignore', text: DOCKERIGNORE, plain: true })
  }
  if ((ctx.deploy.ci ?? 'github') === 'github') text(WORKFLOW, workflow(ctx))
  return out
}

/**
 * Each generated file's state: `missing`, `current`, `stale` (weft's, from an older config), `edited` (by hand: left
 * alone), or `foreign` (no stamp: not weft's).
 */
export function fileStates(root, files) {
  return files.map(f => {
    const abs = join(root, f.path)
    if (!existsSync(abs)) return { ...f, state: 'missing' }
    const now = readFileSync(abs, 'utf8')
    if (now === f.text) return { ...f, state: 'current' }
    if (f.json) return { ...f, state: JSON.parse(now || '{}').buildCommand?.includes('weft build --preset vercel') ? 'edited' : 'stale' }
    if (f.plain) return { ...f, state: 'edited' }
    const m = STAMP.exec(now)
    if (!m) return { ...f, state: 'foreign' }
    return { ...f, state: sha(now.slice(m[0].length)) === m[2] ? 'stale' : 'edited' }
  })
}

/** Write what's missing or stale. Never a file weft didn't write, or one edited since. */
export function writeFiles(root, states, { force = false } = {}) {
  const written = []
  for (const f of states) {
    if (f.state === 'current' || (!force && (f.state === 'edited' || f.state === 'foreign'))) continue
    mkdirSync(dirname(join(root, f.path)), { recursive: true })
    writeFileSync(join(root, f.path), f.text)
    written.push(f.path)
  }
  return written
}
