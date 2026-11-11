// `kerf add`: what the wizard offers, on an app that already exists (research 34 §7). It installs a plugin and adds it to
// the config, whichever format that is. It only ever inserts, and stops rather than guess at a config it can't read.

import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { addRust } from './add-rust.mjs'
import { writeAgentsMd } from './agents-md.mjs'
import { findConfig, loadConfig } from './load-config.mjs'
import { sync } from './plugins.mjs'
import { cssEntry, packages, viteConfig } from './tailwind.mjs'
import { database } from './map.mjs'
import { dbLayer } from './db-layer.mjs'
import { packageOf, trustStatus } from './trust.mjs'

import { usageError, refused } from './add/errors.mjs'
import { addToTs, addToData, listed, names } from './add/config.mjs'
import { setupOf, planSetup, applySetup, setupActions, authEdits } from './add/setup.mjs'

const ALIASES = {
  veneer: '@kerf/veneer',
  icons: '@kerf/veneer-icons',
  text: '@kerf/text',
  media: '@kerf/media',
  'media-ffmpeg': '@kerf/media-ffmpeg',
  'surface-keel': '@kerf/keel-pixel',
  keel: '@kerf/keel',
  redis: '@kerf/realtime-redis',
  nats: '@kerf/realtime-nats',
  agent: '@kerf/agent',
  pay: '@kerf/pay',
  'pay-stripe': '@kerf/pay/stripe',
  'pay-square': '@kerf/pay/square',
}

/** Add-ons `kerf add` knows by the name after the scope, as `kerf add realtime-redis`. */
const ADDONS = new Set([
  '@kerf/text',
  '@kerf/agent',
  '@kerf/pay',
  '@kerf/media',
  '@kerf/media-ffmpeg',
  '@kerf/keel-pixel',
  '@kerf/keel',
  '@kerf/multiplayer',
  '@kerf/realtime-durable-object',
  '@kerf/realtime-livekit',
  '@kerf/realtime-nats',
  '@kerf/realtime-redis',
  '@kerf/realtime-socketio',
  '@kerf/realtime-webrtc',
])

const INSTALL = {
  'pnpm-lock.yaml': ['pnpm', 'add'],
  'bun.lock': ['bun', 'add'],
  'yarn.lock': ['yarn', 'add'],
  'deno.lock': ['deno', 'add'],
  'package-lock.json': ['npm', 'install'],
}

function installer(root) {
  const lock = Object.keys(INSTALL).find((f) => existsSync(join(root, f)))
  return (
    INSTALL[lock] ??
    (process.versions.deno
      ? INSTALL['deno.lock']
      : process.versions.bun
        ? INSTALL['bun.lock']
        : INSTALL['package-lock.json'])
  )
}

/** What to install: for an app on local tarballs (`local.mjs`) those go straight in `package.json`, since npm refuses any
 *  spec for them that isn't spelled exactly as their override is. */
export function pinned(root, specs) {
  const file = join(root, 'package.json')
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  const local = {}
  const rest = specs.filter((spec) => {
    const name = spec.replace(/(?<=.)@.*$/, '')
    const override = pkg.overrides?.[name]
    if (typeof override !== 'string' || !override.startsWith('file:')) return true
    local[name] = override
    return false
  })
  if (Object.keys(local).length)
    writeFileSync(
      file,
      JSON.stringify({ ...pkg, dependencies: { ...pkg.dependencies, ...local } }, null, 2),
    )
  return rest
}

function installSpecs(root, manager, verb, specs) {
  const rest = pinned(root, specs)
  execFileSync(
    manager,
    [verb, ...(manager === 'deno' ? rest.map((spec) => `npm:${spec}`) : rest)],
    { cwd: root, stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' },
  ) // npm is npm.cmd there
}

const VITE = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs']

/** The app's Vite config with Tailwind in it. Stops rather than guess at one it can't place the plugin in. */
function viteWithTailwind(file, text) {
  if (text.includes('@tailwindcss/vite')) return text
  if (!/plugins:\s*\[/.test(text))
    throw refused(
      `${file} has no \`plugins: [\` to add Tailwind to. Add \`tailwindcss()\` from @tailwindcss/vite there, then run this again. Nothing was changed.`,
    )
  return `import tailwindcss from '@tailwindcss/vite'\n${text.replace(/plugins:\s*\[/, '$&tailwindcss(), ')}`
}

/** Tailwind's packages, the Vite plugin, and the top of src/app.css, imported first by the root layout. */
function addTailwind(root, { dryRun, install }) {
  if (!existsSync(join(root, 'package.json')))
    throw refused('`kerf add tailwind` needs a package.json. Nothing was changed.')
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const cssFile = join(root, 'src/app.css')
  const css = existsSync(cssFile) ? readFileSync(cssFile, 'utf8') : ''
  const viteName = VITE.find((f) => existsSync(join(root, f)))
  const vite = viteName
    ? viteWithTailwind(viteName, readFileSync(join(root, viteName), 'utf8'))
    : viteConfig
  const layoutFile = join(root, 'src/routes/_layout.tsx')
  const layout = existsSync(layoutFile) ? readFileSync(layoutFile, 'utf8') : null
  const has = /['"]tailwindcss['"]|tailwindcss\/utilities/.test(css)
  if (has && pkg.dependencies?.tailwindcss)
    return { ok: true, already: true, package: 'tailwindcss', actions: [] }

  const actions = []
  const [manager, verb] = installer(root)
  const specs = Object.entries(packages).map(([name, version]) => `${name}@${version}`)
  if (install) {
    actions.push(`install ${specs.join(' ')} with ${manager}`)
    if (!dryRun) installSpecs(root, manager, verb, specs)
  }
  const veneer = '@kerf/veneer' in { ...pkg.dependencies, ...pkg.devDependencies }
  const edits = [
    [join(root, viteName ?? 'vite.config.ts'), vite],
    ...(has ? [] : [[cssFile, `${cssEntry(veneer)}${css && '\n'}${css}`]]),
  ]
  actions.push(
    `add Tailwind to ${viteName ?? 'vite.config.ts'}`,
    ...(has
      ? []
      : [
          `add Tailwind to src/app.css${veneer ? ' (without its reset, which would override veneer)' : ''}`,
        ]),
  )
  if (layout === null)
    actions.push('import src/app.css from your root layout: there is no src/routes/_layout.tsx')
  else if (!/['"][^'"]*app\.css['"]/.test(layout)) {
    edits.push([layoutFile, `import '../app.css'\n${layout}`])
    actions.push('import src/app.css first in src/routes/_layout.tsx')
  }
  if (dryRun) return { ok: true, package: 'tailwindcss', actions, dryRun: true }
  mkdirSync(join(root, 'src'), { recursive: true })
  for (const [file, text] of edits) writeFileSync(file, text)
  return { ok: true, package: 'tailwindcss', actions }
}

const ENGINES = ['sqlite', 'postgres', 'mysql']
const LAYER_PLUGIN = { prisma: '@kerf/db/plugin-prisma', native: '@kerf/db/plugin-native' }

/** A database on an app that has none: the wiring a scaffold writes, with no todo app. Never touches what's there. */
async function addDb(root, engine = 'sqlite', { layer = 'drizzle', dryRun, install }) {
  if (!ENGINES.includes(engine))
    throw usageError(`kerf add db takes ${ENGINES.join(', ')}, not \`${engine}\``)
  if (!['drizzle', ...Object.keys(LAYER_PLUGIN)].includes(layer))
    throw usageError(`--layer takes drizzle, prisma or native, not \`${layer}\``)
  if (await dbLayer(root))
    throw refused(
      "This app already has a database. Changing engine or layer changes your queries, so it's yours to do. Nothing was changed.",
    )
  const { stackDeps, stackFiles } = await import('create-kerf/stack')
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const name = String(pkg.name ?? 'app').replace(/^@.*\//, '')
  const files = stackFiles({ db: engine, layer, auth: false, name, secret: '' })
  delete files['src/routes/todos/index.tsx']
  delete files['src/server/todos.ts']
  const taken = Object.keys(files).filter(
    (f) => f !== '.env' && f !== '.env.example' && existsSync(join(root, f)),
  )
  if (taken.length)
    throw refused(
      `${taken.join(', ')} already exist, so this can't add a database without overwriting them. Nothing was changed.`,
    )

  const { deps, dev } = stackDeps({ db: engine, layer, auth: false })
  const actions = []
  const [manager, verb] = installer(root)
  if (install) {
    const specs = Object.entries({ ...deps, ...dev }).map(([n, v]) => `${n}@${v}`)
    actions.push(`install ${specs.join(' ')} with ${manager}`)
    if (!dryRun) installSpecs(root, manager, verb, specs)
  }
  actions.push(...Object.keys(files).map((f) => `write ${f}`))
  if (dryRun) return { ok: true, package: `${layer} on ${engine}`, actions, dryRun: true }
  for (const [file, text] of Object.entries(files)) {
    const path = join(root, file)
    mkdirSync(dirname(path), { recursive: true })
    if (file.startsWith('.env') && existsSync(path))
      writeFileSync(path, `${readFileSync(path, 'utf8').trimEnd()}\n${text}`)
    else writeFileSync(path, text)
  }
  if (LAYER_PLUGIN[layer])
    actions.push(...(await addCommand(root, LAYER_PLUGIN[layer], { install: false })).actions)
  actions.push('next: `kerf db generate`')
  return { ok: true, package: `${layer} on ${engine}`, actions }
}

/** Better Auth on an app with a database. Its tables go beside yours, and your own routes stay as they are. */
async function addAuth(root, { dryRun, install }) {
  const layer = await dbLayer(root)
  if (!layer)
    throw refused(
      'Better Auth keeps users in a database: run `kerf add db` first. Nothing was changed.',
    )
  if (existsSync(join(root, 'src/auth.server.ts')))
    throw refused(
      'src/auth.server.ts already exists, so this app has an auth provider. Nothing was changed.',
    )
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const db = database(root, layer).engine
  const ui = '@kerf/veneer' in { ...pkg.dependencies, ...pkg.devDependencies } ? 'veneer' : 'none'
  const { authFiles, stackDeps } = await import('create-kerf/stack')
  const { files, context, tables } = authFiles({ db, layer: layer.layer, ui })
  const contextFile = join(root, 'src/context.server.ts')
  if (
    existsSync(contextFile) &&
    !/export default \(\) => \(\{ db \}\)/.test(readFileSync(contextFile, 'utf8'))
  )
    throw refused(
      'src/context.server.ts has been changed. Spread `session(auth, request)` from @kerf/start/auth into it, then run this again. Nothing was changed.',
    )
  const taken = Object.keys(files).filter((f) => existsSync(join(root, f)))
  if (taken.length) throw refused(`${taken.join(', ')} already exist. Nothing was changed.`)
  const envModule = join(root, 'src/env.server.ts')
  const envText = existsSync(envModule) ? readFileSync(envModule, 'utf8') : ''
  if (!envText.includes('BETTER_AUTH_SECRET') && !/server: \{\n/.test(envText))
    throw refused(
      'src/env.server.ts has no `server: {` block to add BETTER_AUTH_SECRET to. Nothing was changed.',
    )

  const actions = []
  const [manager, verb] = installer(root)
  const wanted = stackDeps({ db, layer: layer.layer, auth: true }).deps
  const specs = Object.entries(wanted)
    .filter(([name]) => !(name in (pkg.dependencies ?? {})))
    .map(([n, v]) => `${n}@${v}`)
  if (install && specs.length) {
    actions.push(`install ${specs.join(' ')} with ${manager}`)
    if (!dryRun) installSpecs(root, manager, verb, specs)
  }
  const edits = authEdits({ root, files, context, tables, envText, layer })
  actions.push(...Object.keys(edits).map((f) => `write ${f}`))
  if (!dryRun) {
    for (const [file, text] of Object.entries(edits)) {
      mkdirSync(dirname(join(root, file)), { recursive: true })
      writeFileSync(join(root, file), text)
    }
    const env = join(root, '.env')
    if (!(existsSync(env) && readFileSync(env, 'utf8').includes('BETTER_AUTH_SECRET')))
      writeFileSync(
        env,
        `${existsSync(env) ? `${readFileSync(env, 'utf8').trimEnd()}\n` : ''}BETTER_AUTH_SECRET=${randomBytes(32).toString('base64')}\nBETTER_AUTH_URL=http://localhost:5173\n`,
      )
  }
  actions.push(
    'add BETTER_AUTH_SECRET to .env',
    ...(layer.schema ? ['next: `kerf db generate`'] : []),
    'next: reload the app: the migration applies on the next request',
    "next: add `auth: 'user'` to what needs a user, and link to /login",
  )
  return {
    ok: true,
    package: `Better Auth on ${layer.layer}`,
    actions,
    ...(dryRun && { dryRun: true }),
  }
}

export async function addCommand(
  root,
  feature,
  { dryRun = false, install = true, engine, layer, remote = false } = {},
) {
  root = resolve(root)
  if (!feature)
    throw usageError(
      `kerf add needs a feature: db, auth, tailwind, rust, ${Object.keys(ALIASES).join(', ')}, or a package name`,
    )
  if (feature === 'rust') {
    const [manager, verb] = installer(root)
    return addRust(root, engine, {
      remote,
      dryRun,
      install,
      installSpecs: (specs) => installSpecs(root, manager, verb, specs),
    })
  }
  if (feature === 'tailwind') return addTailwind(root, { dryRun, install })
  if (feature === 'db') return addDb(root, engine, { layer, dryRun, install })
  if (feature === 'auth') return addAuth(root, { dryRun, install })
  const pkg =
    ALIASES[feature] ?? (ADDONS.has(`@kerf/${feature}`) ? `@kerf/${feature}` : feature)
  const file = findConfig(root) ?? join(root, 'kerf.config.ts')
  const config = relative(root, file)
  const text = existsSync(file)
    ? readFileSync(file, 'utf8')
    : "import { defineConfig } from '@kerf/core/config'\n\nexport default defineConfig({})\n"
  const named = names(text, pkg)
  // A config can name a package that isn't installed yet, and importing it then would leave this process's module
  // resolver sure the package has no `exports`, so the load after the install would fail too. Load it once it's there.
  const present = existsSync(join(root, 'node_modules', packageOf(pkg), 'package.json'))
  if (present && (named || listed((await loadConfig(root)).config, pkg)))
    return { ok: true, already: true, package: pkg, config, actions: [] }

  const home = packageOf(pkg)

  const actions = []
  const [manager, verb] = installer(root)
  if (install) {
    actions.push(`install ${home} with ${manager}`)
    if (!dryRun) installSpecs(root, manager, verb, [home])
  }
  const setup = await setupOf(root, pkg)
  const plan = setup && (await planSetup(root, setup))
  const next = named
    ? text
    : /\.(json|ya?ml)$/.test(file)
      ? addToData(file, text, pkg)
      : addToTs(root, file, text, pkg)
  if (!named) actions.push(`add ${pkg} to ${config}`)
  if (dryRun)
    return {
      ok: true,
      package: pkg,
      config,
      actions: [...actions, ...(plan ? setupActions(plan) : [])],
      dryRun: true,
    }

  return finishAdd({ root, file, next, text, config, pkg, install, actions, plan, setup })
}

async function finishAdd({ root, file, next, text, config, pkg, install, actions, plan, setup }) {
  writeFileSync(file, next)
  const after = await loadConfig(root)
  const failed = after.diagnostics.filter((d) => d.severity === 'error')
  if (failed.length) {
    writeFileSync(file, text)
    throw refused(
      `${config} doesn't load with ${pkg} in it${install ? ', though the package installed' : ''}, so it's back as it was: ${failed[0].code} ${failed[0].why}`,
    )
  }
  sync(root, after)
  actions.push('regenerate .kerf/slots')
  if (plan) {
    for (const other of setup.with ?? [])
      actions.push(...(await addCommand(root, other, { install })).actions)
    applySetup(root, plan)
    actions.push(...setupActions(plan))
  }
  // Never approved here: installing a plugin isn't having read what it asks for.
  const trust = trustStatus(root, after).plugins.find((p) => p.name === pkg)
  // Only the generated file: a scaffold's short one is the app's own until `kerf agents-md` is asked for.
  if (
    existsSync(join(root, 'AGENTS.md')) &&
    readFileSync(join(root, 'AGENTS.md'), 'utf8').includes('Generated by `kerf agents-md`')
  ) {
    await writeAgentsMd(root)
    actions.push('regenerate AGENTS.md')
  }
  actions.push(...(after.contributions?.find((c) => c.name === pkg)?.manifest?.notes ?? []))
  if (trust?.blocked)
    actions.push(
      `${pkg} asks for ${[...trust.added, ...trust.hidden.map((n) => `${n} (undeclared)`)].join(', ') || 'a code change'}; \`kerf check\` stops until you run \`kerf plugins approve ${pkg}\``,
    )
  return {
    ok: true,
    package: pkg,
    config,
    actions,
    ...(trust?.blocked && { approve: { added: trust.added, undeclared: trust.hidden } }),
  }
}
