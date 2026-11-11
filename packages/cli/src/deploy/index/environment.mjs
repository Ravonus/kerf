import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** A variable a step reads, and whether its absence stops the deploy (E007). */
export function missingEnv(root, target, config, env) {
  const ci = !!env.CI
  const linked = {
    netlify: existsSync(join(root, '.netlify/state.json')) || !!config.deploy?.netlify?.site,
    vercel: existsSync(join(root, '.vercel/project.json')),
  }
  // a token: the CLI's own login stands in, except in CI. An id: needed unless the project is linked.
  const token = (k, how) => [k, ci ? 'error' : 'warning', how, ": the CLI's own login is used"]
  const id = (k, known, how) => [k, known ? null : 'error', how, '']
  const need = {
    netlify: [
      token(
        'NETLIFY_AUTH_TOKEN',
        '`netlify login` here, or a personal access token from User settings → Applications',
      ),
      id(
        'NETLIFY_SITE_ID',
        linked.netlify,
        '`netlify link`, `deploy.netlify.site`, or the site id from Site configuration',
      ),
    ],
    vercel: [
      token('VERCEL_TOKEN', '`vercel login` here, or a token from Account Settings → Tokens'),
      id('VERCEL_ORG_ID', linked.vercel, '`vercel link` writes it to .vercel/project.json'),
      id('VERCEL_PROJECT_ID', linked.vercel, '`vercel link` writes it to .vercel/project.json'),
    ],
    cloudflare: [
      token('CLOUDFLARE_API_TOKEN', '`wrangler login` here, or a token with Workers Scripts: Edit'),
      id('CLOUDFLARE_ACCOUNT_ID', !ci, 'the account id on the Workers overview page'),
    ],
    fly: [token('FLY_API_TOKEN', '`flyctl auth login` here, or `flyctl tokens create deploy`')],
    render: [id('RENDER_DEPLOY_HOOK_URL', false, "the service's Settings → Deploy Hook")],
  }[target]
  return need
    .filter(([k, severity]) => severity && !env[k])
    .map(([k, severity, how, local]) => ({
      code: 'E007',
      severity,
      file: 'kerf.config.ts',
      why: `\`${k}\` is unset${severity === 'warning' ? local : ''}`,
      fix: `${how}. Set it in the environment (never a file)`,
    }))
}

/** The URL a host's CLI printed. */
export function urlFrom(step, stdout) {
  if (step.url === 'json') {
    try {
      const j = JSON.parse(stdout.slice(stdout.indexOf('{')))
      return j.url ?? j.deploy_url
    } catch {
      return
    }
  }
  if (step.url === 'last-line')
    return stdout
      .trim()
      .split('\n')
      .reverse()
      .find((l) => l.trim().startsWith('https://'))
      ?.trim()
  if (step.url === 'workers') return /https:\/\/[\w.-]+\.workers\.dev/.exec(stdout)?.[0]
  if (step.url === 'fly') return /https:\/\/[\w.-]+\.fly\.dev/.exec(stdout)?.[0]
  return step.url
}
