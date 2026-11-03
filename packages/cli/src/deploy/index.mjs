// `weft deploy`, `weft deploy hosts`, `weft deploy init`, and what `weft check` and `weft doctor` say about the deploy
// (research 46). Nothing here talks to a provider except `weft deploy --yes`, which runs the host's own CLI.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { diagnostic, locate } from '../diag.mjs'
import { findConfig, isDataConfig } from '../load-config.mjs'
import { cdnFindings, writtenSecrets } from './cdn.mjs'
import { fileStates, filesFor, managerOf, writeFiles } from './files.mjs'
import { fit, hostsReport } from './fit.mjs'
import { HOSTS, TARGETS, host, presetFor } from './hosts.mjs'
import { needsOf } from './needs.mjs'

export { HOSTS, TARGETS, fit, hostsReport, needsOf }

const usage = message => Object.assign(new Error(message), { code: 'E_USAGE' })
const refused = message => Object.assign(new Error(message), { code: 'E_REFUSED' })

/** A finding as a diagnostic, pointing at the file that shows the need. */
function toDiagnostic(root, f) {
  let text = ''
  try { text = readFileSync(join(root, f.file), 'utf8') } catch {}
  const at = f.line ? { span: [f.line, 1, f.line, 1] } : text && f.needle ? locate(text, f.needle) : {}
  return diagnostic({ code: f.code, severity: f.severity, file: f.file, ...at, why: f.why, help: f.fix })
}

/** The target this run is about: `--target`, then `deploy.target`, then the host whose preset `--preset` names. */
export function targetOf(config, { target, preset } = {}) {
  const id = target ?? config.deploy?.target ?? (preset && HOSTS.find(h => h.preset === preset)?.id)
  if (id && !host(id)) throw usage(`unknown deploy target \`${id}\`: use ${TARGETS.join(', ')}`)
  return id
}

/** E001–E004, E006, E008–E014 for `weft check`: the configured target's fit, its files, written secrets, CDN setup. */
export function deployChecks(root, config, { preset } = {}) {
  const out = writtenSecrets(root).map(s => ({ code: 'E008', severity: 'error', file: s.file, line: s.line, why: `${s.file}:${s.line} has ${s.what} in it: it would be committed, and anyone with the repository could deploy or bill as you`, fix: 'Move it to the environment (the host\'s settings, or GitHub\'s secrets for the workflow), and rotate it: it has been seen' }))
  let id
  try { id = targetOf(config, { preset }) } catch { id = undefined }
  const deploy = config.deploy ?? {}
  if (id) {
    out.push(...fit(needsOf(root, config), host(id), { deploy }).findings)
    if (deploy.target === id && host(id).deploys) {
      for (const f of fileStates(root, filesFor(initContext(root, config, id)))) {
        if (f.state === 'missing' || f.state === 'stale') out.push({ code: 'E006', severity: 'warning', file: f.path, why: `\`${f.path}\` is ${f.state === 'missing' ? 'missing' : 'from an older config'}: ${host(id).name} would deploy ${f.state === 'missing' ? 'without it' : 'what it said then'}`, fix: '`weft deploy init` writes it (a file edited by hand is left alone)' })
      }
    }
  }
  out.push(...cdnFindings(config))
  return out.map(f => toDiagnostic(root, f))
}

/** What the generators read. */
export function initContext(root, config, target) {
  return { target, deploy: config.deploy ?? {}, needs: needsOf(root, config), runtime: config.runtime ?? 'node', manager: managerOf(root) }
}

/** `weft deploy hosts`, and the `deploy` part of `weft doctor`: every host's fit and the suggestion (E005 when none is set). */
export function hostsCommand(root, config) {
  const needs = needsOf(root, config)
  const report = hostsReport(needs, { deploy: config.deploy })
  const used = Object.entries(needs).filter(([k, v]) => k !== 'runtime' && v).map(([k, v]) => ({ need: k, ...v }))
  const diagnostics = config.deploy?.target ? [] : [diagnostic({ code: 'E005', severity: 'info', file: findConfig(root) ? relative(root, findConfig(root)) : 'weft.config.ts', why: `No \`deploy.target\`. ${report.fits.filter(f => f.fits && f.deploys).map(f => f.name).join(', ')} can run this app; weft suggests ${host(report.suggestion.host).name}: ${report.suggestion.why}.`, help: `\`weft deploy init ${report.suggestion.host}\`` })]
  return { needs: used, ...report, target: config.deploy?.target ?? null, diagnostics }
}

export function formatHosts(r) {
  const lines = [`needs: ${r.needs.length ? r.needs.map(n => `${n.what} (${n.file})`).join(', ') : 'nothing a CDN with functions can\'t give'}`, '']
  for (const f of r.fits) {
    const mark = f.fits ? (f.findings.length ? '~' : '✓') : '✗'
    lines.push(`${mark} ${f.host.padEnd(11)} ${f.name}${f.deploys ? '' : ' (fit only: `weft deploy` doesn\'t drive it yet)'}`)
    for (const x of f.findings) lines.push(`    ${x.code} ${x.why}. Fix: ${x.fix}`)
    lines.push(`    cost: ${f.cost} (${f.pricing})`)
  }
  lines.push('', `suggested: ${r.suggestion.host}, because ${r.suggestion.why}${r.suggestion.alternative ? `. Next best: ${r.suggestion.alternative}` : ''}`)
  return lines.join('\n')
}

/** The object literal `export default` gives, directly or through `defineConfig(…)`. */
function configObject(sf) {
  for (const st of sf.statements) {
    if (!ts.isExportAssignment(st)) continue
    const value = ts.isCallExpression(st.expression) ? st.expression.arguments[0] : st.expression
    if (value && ts.isObjectLiteralExpression(value)) return value
  }
}

/** The `deploy` block init writes when the config has none: the names a host needs, from package.json, and a disk when data needs one. */
export function defaultDeploy(root, target, needs) {
  let name = 'my-app'
  try { name = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name?.replace(/^@[^/]+\//, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase() || name } catch {}
  const kept = needs.sqlite || needs.uploads
  const per = {
    netlify: { site: name }, vercel: { project: name }, cloudflare: { name },
    fly: { app: name, region: 'iad', ...(kept && { volume: { name: 'data', sizeGb: 1 } }) },
    render: { service: name, ...(kept && { plan: 'starter', disk: { sizeGb: 1 } }) },
  }
  return { target, [target]: per[target], ci: 'github', branch: 'main' }
}

const literal = (v, pad = '  ') => {
  if (v && typeof v === 'object') return `{ ${Object.entries(v).map(([k, x]) => `${k}: ${literal(x, pad)}`).join(', ')} }`
  return typeof v === 'string' ? `'${v}'` : String(v)
}

/** The config with `deploy` added. Refuses to touch one that already has it, or that isn't a plain object. */
export function withDeploy(file, text, deploy) {
  if (isDataConfig(file)) {
    if (file.endsWith('.json')) return `${JSON.stringify({ ...JSON.parse(text), deploy }, null, 2)}\n`
    return `${text.replace(/\n*$/, '\n')}deploy:\n${Object.entries(deploy).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`).join('\n')}\n`
  }
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const object = configObject(sf)
  if (!object) throw refused(`${file} doesn't export a plain object, so \`weft deploy init\` can't add \`deploy\` to it. Add \`deploy: ${literal(deploy)}\` by hand. Nothing was changed.`)
  const block = `deploy: ${literal(deploy)},`
  const last = object.properties.at(-1)
  return last ? text.slice(0, object.properties.end) + `${object.properties.hasTrailingComma ? '' : ','}\n  ${block}` + text.slice(object.properties.end) : text.slice(0, object.getStart(sf) + 1) + `\n  ${block}\n` + text.slice(object.getStart(sf) + 1)
}

/**
 * `weft deploy init [target]`: the host's files and workflow, and `deploy` in the config when it has none. Refuses a
 * target the app doesn't fit unless `unsafe` lets the codes through.
 */
export function initCommand(root, config, { target, dryRun = false, force = false, unsafe } = {}) {
  const needs = needsOf(root, config)
  const id = targetOf(config, { target }) ?? hostsReport(needs).suggestion.host
  const h = host(id)
  if (!h.deploys) throw usage(`\`weft deploy\` doesn't drive ${h.name} yet (research 46 §11): ${TARGETS.join(', ')} it does`)
  if (config.deploy?.target && target && config.deploy.target !== target) throw refused(`\`deploy.target\` is \`${config.deploy.target}\` in the config. Change it there to move to \`${target}\`, then run this again. Nothing was changed.`)
  const deploy = config.deploy ?? defaultDeploy(root, id, needs)
  const result = fit(needs, h, { deploy })
  const blocking = result.findings.filter(f => f.severity === 'error' && !unsafe?.allows(f))
  if (blocking.length) throw refused(`${h.name} can't run this app:\n${blocking.map(f => `  ${f.code} ${f.file}: ${f.why}.\n       Fix: ${f.fix}`).join('\n')}\n\`weft deploy hosts\` shows which hosts can. Nothing was changed.`)
  const ctx = { ...initContext(root, { ...config, deploy }, id) }
  const states = fileStates(root, filesFor(ctx))
  const configFile = findConfig(root)
  const actions = []
  let written = []
  if (!config.deploy) {
    const file = configFile ?? join(root, 'weft.config.ts')
    const text = configFile ? readFileSync(configFile, 'utf8') : "import { defineConfig } from '@weft-js/core/config'\n\nexport default defineConfig({})\n"
    actions.push(`${relative(root, file)}: ${configFile ? '' : '(new) '}deploy: ${literal(deploy)}`)
    if (!dryRun) writeFileSync(file, withDeploy(file, text, deploy))
  }
  for (const f of states) actions.push(`${f.path}: ${{ missing: 'write', stale: 'rewrite (from an older config)', current: 'current', edited: force ? 'overwrite (edited by hand; --force)' : 'edited by hand: left alone', foreign: force ? 'overwrite (--force)' : 'not written by weft: left alone' }[f.state]}`)
  if (!dryRun) written = writeFiles(root, states, { force })
  const next = [
    ...{
      netlify: [`netlify sites:create --name ${deploy.netlify?.site ?? '<name>'}   (once; or link an existing site with \`netlify link\`)`],
      vercel: [`vercel link --project ${deploy.vercel?.project ?? '<name>'}   (once: writes .vercel/project.json with the org and project ids)`],
      cloudflare: ['wrangler login   (once, locally; CI reads CLOUDFLARE_API_TOKEN)'],
      fly: [`flyctl apps create ${deploy.fly?.app ?? '<name>'}   (once; billed per running machine)`, ...(deploy.fly?.volume ? [`flyctl volumes create ${deploy.fly.volume.name ?? 'data'} --size ${deploy.fly.volume.sizeGb ?? 1} --region ${deploy.fly.region ?? 'iad'} -a ${deploy.fly.app}   (once; billed)`] : [])],
      render: ['Create the service from render.yaml: Render dashboard → New → Blueprint, on this repository (once)', 'Copy the service\'s deploy hook (Settings → Deploy Hook) into RENDER_DEPLOY_HOOK_URL'],
    }[id],
    ...((deploy.ci ?? 'github') === 'github' ? [`gh secret set ${h.env.join(' / ')}   (each one, from the host's dashboard: weft never writes them)`] : []),
    `weft deploy   (a dry run: shows what --yes would run)`,
  ]
  return { ok: true, target: id, dryRun, actions, written, next, findings: result.findings.map(f => toDiagnostic(root, f)) }
}

/** The host's CLI: on PATH, else through npx for the ones on npm. */
function cliFor(name, { which = cmd => spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' }).status === 0 } = {}) {
  const npm = { netlify: 'netlify-cli', vercel: 'vercel', wrangler: 'wrangler' }
  for (const cmd of name === 'flyctl' ? ['flyctl', 'fly'] : [name]) if (which(cmd)) return [cmd]
  if (npm[name]) return ['npx', '--yes', npm[name]]
  throw refused(`\`${name}\` isn't installed: ${name === 'flyctl' ? 'https://fly.io/docs/flyctl/install/' : `npm install -g ${npm[name] ?? name}`}`)
}

/**
 * The steps `weft deploy` takes for a target, as data: a dry run prints them, `--yes` runs them. A step reads env vars
 * by name; their values are filled in only as it runs.
 */
export function deploySteps(root, config, { target, prod = false, which } = {}) {
  const h = host(target)
  const deploy = config.deploy ?? {}
  const runtime = config.runtime ?? 'node'
  const needs = needsOf(root, config)
  const steps = []
  const build = { kind: 'build', what: `weft build --preset ${presetFor(h, runtime)}`, preset: presetFor(h, runtime) }
  if (target === 'netlify') {
    const site = process.env.NETLIFY_SITE_ID ? [] : deploy.netlify?.site ? ['--site', deploy.netlify.site] : []
    steps.push(build, { kind: 'run', cli: 'netlify', args: ['deploy', '--dir', 'dist', '--functions', '.netlify/functions-internal', '--json', ...site, ...(prod ? ['--prod'] : [])], reads: ['NETLIFY_AUTH_TOKEN', 'NETLIFY_SITE_ID'], url: 'json' })
  }
  if (target === 'vercel') steps.push(build, { kind: 'run', cli: 'vercel', args: ['deploy', '--prebuilt', '--yes', ...(prod ? ['--prod'] : [])], token: 'VERCEL_TOKEN', reads: ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'], url: 'last-line' })
  if (target === 'cloudflare') steps.push(build, { kind: 'run', cli: 'wrangler', args: ['deploy'], cwd: '.output', reads: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'], url: 'workers' })
  if (target === 'fly') {
    // one machine unless a bus reaches the others: a second machine would split the rooms, and a volume is per machine
    const one = needs.memoryBus || deploy.fly?.volume
    steps.push({ kind: 'run', cli: 'flyctl', args: ['deploy', '--remote-only', ...(deploy.fly?.app ? ['--app', deploy.fly.app] : []), ...(one ? ['--ha=false'] : [])], reads: ['FLY_API_TOKEN'], url: deploy.fly?.app ? `https://${deploy.fly.app}.fly.dev` : 'fly' })
  }
  if (target === 'render') steps.push({ kind: 'hook', what: 'POST $RENDER_DEPLOY_HOOK_URL (Render builds the pushed commit)', reads: ['RENDER_DEPLOY_HOOK_URL'], url: deploy.render?.service ? `https://${deploy.render.service}.onrender.com` : undefined })
  for (const s of steps) if (s.cli) s.what = `${s.cli} ${s.args.join(' ')}${s.token ? ` --token $${s.token}` : ''}${s.cwd ? `   (in ${s.cwd}/)` : ''}`
  return steps
}

/** A variable a step reads, and whether its absence stops the deploy (E007). */
function missingEnv(root, target, config, env) {
  const ci = !!env.CI
  const linked = { netlify: existsSync(join(root, '.netlify/state.json')) || !!config.deploy?.netlify?.site, vercel: existsSync(join(root, '.vercel/project.json')) }
  // a token: the CLI's own login stands in, except in CI. An id: needed unless the project is linked.
  const token = (k, how) => [k, ci ? 'error' : 'warning', how, ': the CLI\'s own login is used']
  const id = (k, known, how) => [k, known ? null : 'error', how, '']
  const need = {
    netlify: [token('NETLIFY_AUTH_TOKEN', '`netlify login` here, or a personal access token from User settings → Applications'), id('NETLIFY_SITE_ID', linked.netlify, '`netlify link`, `deploy.netlify.site`, or the site id from Site configuration')],
    vercel: [token('VERCEL_TOKEN', '`vercel login` here, or a token from Account Settings → Tokens'), id('VERCEL_ORG_ID', linked.vercel, '`vercel link` writes it to .vercel/project.json'), id('VERCEL_PROJECT_ID', linked.vercel, '`vercel link` writes it to .vercel/project.json')],
    cloudflare: [token('CLOUDFLARE_API_TOKEN', '`wrangler login` here, or a token with Workers Scripts: Edit'), id('CLOUDFLARE_ACCOUNT_ID', !ci, 'the account id on the Workers overview page')],
    fly: [token('FLY_API_TOKEN', '`flyctl auth login` here, or `flyctl tokens create deploy`')],
    render: [id('RENDER_DEPLOY_HOOK_URL', false, "the service's Settings → Deploy Hook")],
  }[target]
  return need.filter(([k, severity]) => severity && !env[k]).map(([k, severity, how, local]) => ({ code: 'E007', severity, file: 'weft.config.ts', why: `\`${k}\` is unset${severity === 'warning' ? local : ''}`, fix: `${how}. Set it in the environment (never a file)` }))
}

/** The URL a host's CLI printed. */
export function urlFrom(step, stdout) {
  if (step.url === 'json') {
    try { const j = JSON.parse(stdout.slice(stdout.indexOf('{'))); return j.url ?? j.deploy_url } catch { return }
  }
  if (step.url === 'last-line') return stdout.trim().split('\n').reverse().find(l => /^https:\/\//.test(l.trim()))?.trim()
  if (step.url === 'workers') return /https:\/\/[\w.-]+\.workers\.dev/.exec(stdout)?.[0]
  if (step.url === 'fly') return /https:\/\/[\w.-]+\.fly\.dev/.exec(stdout)?.[0]
  return step.url
}

/**
 * `weft deploy`: fit, then the steps. Without `yes` nothing runs: the result says what would. `build` is `weft build`
 * in-process (start.mjs's buildCommand), `exec` runs a host CLI; both are injectable for tests.
 */
export async function deployCommand(root, config, { target, prod = false, yes = false, unsafe, env = process.env, build, exec = defaultExec, which, post = (url) => fetch(url, { method: 'POST' }) } = {}) {
  const id = targetOf(config, { target })
  if (!id) {
    const s = hostsReport(needsOf(root, config)).suggestion
    throw refused(`no deploy target: set \`deploy.target\` (\`weft deploy init\` does, and writes the host's files), or pass --target. weft suggests \`${s.host}\`: ${s.why}`)
  }
  const h = host(id)
  if (!h.deploys) throw usage(`\`weft deploy\` doesn't drive ${h.name} yet (research 46 §11)`)
  if (h.kind === 'server' && !prod) throw usage(`${h.name} has no preview deploys: pass --prod to deploy production`)
  const needs = needsOf(root, config)
  const findings = fit(needs, h, { deploy: config.deploy ?? {}, local: !env.CI }).findings
  const blocking = findings.filter(f => f.severity === 'error' && !unsafe?.allows(f))
  if (blocking.length) throw refused(`${h.name} can't run this app:\n${blocking.map(f => `  ${f.code} ${f.file}: ${f.why}.\n       Fix: ${f.fix}`).join('\n')}\nTo deploy anyway: --unsafe-allow ${[...new Set(blocking.map(f => f.code))].join(',')}`)
  const steps = deploySteps(root, config, { target: id, prod, which })
  const envFindings = missingEnv(root, id, config, env)
  const diagnostics = [...findings, ...envFindings, ...cdnFindings(config, { env })].map(f => toDiagnostic(root, f))
  if (!yes) return { ok: true, dryRun: true, target: id, prod, steps: steps.map(s => ({ what: s.what, reads: s.reads ?? [] })), diagnostics }
  const stop = envFindings.find(f => f.severity === 'error')
  if (stop) throw refused(`E007: ${stop.why}. ${stop.fix}.`)
  let url
  for (const s of steps) {
    if (s.kind === 'build') {
      const built = await build(root, { preset: s.preset })
      diagnostics.push(...built.diagnostics)
      if (!built.ok) throw refused('weft build failed: nothing was deployed. Fix the errors above.')
    } else if (s.kind === 'hook') {
      const res = await post(env.RENDER_DEPLOY_HOOK_URL)
      if (!res.ok) throw refused(`Render's deploy hook answered ${res.status}: nothing was deployed. Check RENDER_DEPLOY_HOOK_URL.`)
      url = s.url
    } else {
      const [cmd, ...pre] = cliFor(s.cli, { which })
      const args = [...pre, ...s.args, ...(s.token && env[s.token] ? ['--token', env[s.token]] : [])]
      const r = await exec(cmd, args, { cwd: join(root, s.cwd ?? ''), env })
      if (r.code !== 0) throw refused(`${s.cli} failed (exit ${r.code}): nothing more was run.\n${(r.stderr || r.stdout).trim().split('\n').slice(-15).join('\n')}`)
      url = urlFrom(s, r.stdout) ?? url
    }
  }
  return { ok: true, dryRun: false, target: id, prod, url: url ?? null, diagnostics }
}

/** A host CLI with its progress on stderr, as it goes, and stdout kept for the URL. */
function defaultExec(cmd, args, { cwd, env }) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 })
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.error?.message ?? '' }
}
