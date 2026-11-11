import { host, presetFor } from '../hosts.mjs'
import { needsOf } from '../needs.mjs'

/**
 * The steps `kerf deploy` takes for a target, as data: a dry run prints them, `--yes` runs them. A step reads env vars
 * by name; their values are filled in only as it runs.
 */
export function deploySteps(root, config, { target, prod = false } = {}) {
  const h = host(target)
  const deploy = config.deploy ?? {}
  const runtime = config.runtime ?? 'node'
  const needs = needsOf(root, config)
  const steps = []
  const build = {
    kind: 'build',
    what: `kerf build --preset ${presetFor(h, runtime)}`,
    preset: presetFor(h, runtime),
  }
  if (target === 'netlify') {
    const site = process.env.NETLIFY_SITE_ID
      ? []
      : deploy.netlify?.site
        ? ['--site', deploy.netlify.site]
        : []
    steps.push(build, {
      kind: 'run',
      cli: 'netlify',
      args: [
        'deploy',
        '--dir',
        'dist',
        '--functions',
        '.netlify/functions-internal',
        '--json',
        ...site,
        ...(prod ? ['--prod'] : []),
      ],
      reads: ['NETLIFY_AUTH_TOKEN', 'NETLIFY_SITE_ID'],
      url: 'json',
    })
  }
  if (target === 'vercel')
    steps.push(build, {
      kind: 'run',
      cli: 'vercel',
      args: ['deploy', '--prebuilt', '--yes', ...(prod ? ['--prod'] : [])],
      token: 'VERCEL_TOKEN',
      reads: ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'],
      url: 'last-line',
    })
  if (target === 'cloudflare')
    steps.push(build, {
      kind: 'run',
      cli: 'wrangler',
      args: ['deploy'],
      cwd: '.output',
      reads: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'],
      url: 'workers',
    })
  if (target === 'fly') {
    // one machine unless a bus reaches the others: a second machine would split the rooms, and a volume is per machine
    const one = needs.memoryBus || deploy.fly?.volume
    steps.push({
      kind: 'run',
      cli: 'flyctl',
      args: [
        'deploy',
        '--remote-only',
        ...(deploy.fly?.app ? ['--app', deploy.fly.app] : []),
        ...(one ? ['--ha=false'] : []),
      ],
      reads: ['FLY_API_TOKEN'],
      url: deploy.fly?.app ? `https://${deploy.fly.app}.fly.dev` : 'fly',
    })
  }
  if (target === 'render')
    steps.push({
      kind: 'hook',
      what: 'POST $RENDER_DEPLOY_HOOK_URL (Render builds the pushed commit)',
      reads: ['RENDER_DEPLOY_HOOK_URL'],
      url: deploy.render?.service ? `https://${deploy.render.service}.onrender.com` : undefined,
    })
  for (const s of steps)
    if (s.cli)
      s.what = `${s.cli} ${s.args.join(' ')}${s.token ? ` --token $${s.token}` : ''}${s.cwd ? `   (in ${s.cwd}/)` : ''}`
  return steps
}
