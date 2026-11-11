// What a half-set-up deploy looks like, without touching a provider (research 46 §8, §9): a credential written into a
// file (E008), Cloudflare in front of nothing or in front of a CDN (E010, E011), and Cloudinary without what it needs
// (E012–E014).

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { host } from './hosts.mjs'

/** Credentials with a shape of their own, and a value assigned to a key that names one. */
const SHAPED = [
  [/\bnfp_[A-Za-z0-9]{20,}/, 'a Netlify token'],
  [/\bFlyV1\s+fm\d_[A-Za-z0-9+/=_-]{20,}/, 'a Fly token'],
  [
    /api\.render\.com\/deploy\/srv-[\w-]+\?key=[\w-]+/,
    'a Render deploy hook (its key deploys the service)',
  ],
  [/cloudinary:\/\/\d+:[^@\s'"]+@/, 'a Cloudinary URL with its secret'],
]
const KEYED =
  /\b[\w-]*(token|secret|api[_-]?key|password)[\w-]*["']?\s*[:=]\s*["']([^"'\s$]{16,})["']/i

const FILES = [
  'kerf.config.ts',
  'kerf.config.mts',
  'kerf.config.js',
  'kerf.config.mjs',
  'kerf.config.json',
  'kerf.config.yaml',
  'kerf.config.yml',
  'netlify.toml',
  'vercel.json',
  'wrangler.toml',
  'fly.toml',
  'render.yaml',
  'Dockerfile',
]

/** E008: a credential in a file that gets committed, comments included. An env var's name, or `${{ secrets.X }}`, is never one. */
export function writtenSecrets(root) {
  const out = []
  const wf = join(root, '.github/workflows')
  const files = [
    ...FILES,
    ...(existsSync(wf)
      ? readdirSync(wf)
          .filter((f) => /\.ya?ml$/.test(f))
          .map((f) => `.github/workflows/${f}`)
      : []),
  ]
  for (const file of files) {
    let text
    try {
      text = readFileSync(join(root, file), 'utf8')
    } catch {
      continue
    }
    text.split('\n').forEach((line, i) => {
      const shaped = SHAPED.find(([re]) => re.test(line))
      const keyed = !shaped && KEYED.exec(line)
      if (shaped || keyed)
        out.push({
          file,
          line: i + 1,
          what: shaped ? shaped[1] : `a value for \`${keyed[0].split(/["':=\s]/)[0]}\``,
        })
    })
  }
  return out
}

/** Hosts whose own domain says the proxy isn't in front. */
const OWN = /\.(fly\.dev|onrender\.com|netlify\.app|vercel\.app|workers\.dev|pages\.dev)$/

/** E010–E014 from the config, and the environment when `env` is given (a deploy or `kerf doctor`). */
export function cdnFindings(config = {}, { env } = {}) {
  const out = []
  const cdn = config.deploy?.cdn ?? {}
  const target = config.deploy?.target && host(config.deploy.target)
  const add = (code, severity, why, fix) =>
    out.push({ code, severity, file: 'kerf.config.ts', why, fix })
  if (cdn.proxy === 'cloudflare') {
    let url
    try {
      url = config.site?.url && new URL(config.site.url).hostname
    } catch {}
    if (url && OWN.test(url))
      add(
        'E010',
        'warning',
        `\`deploy.cdn.proxy\` is Cloudflare, and \`site.url\` is \`${url}\`, the host's own domain: nothing goes through the proxy, and canonical URLs point past it`,
        'Set `site.url` to the domain Cloudflare proxies, with its DNS record proxied (orange cloud) to the host',
      )
    if (target && target.kind !== 'server')
      add(
        'E011',
        'warning',
        `\`deploy.cdn.proxy\` puts Cloudflare in front of ${target.name}, which is a CDN already: two caches, and a deploy purges only its own`,
        'Drop `cdn.proxy`, or deploy to a server host (`fly`, `render`) behind it',
      )
  }
  const images = cdn.images
  if (images?.provider === 'cloudinary') {
    const plugins = (config.plugins ?? []).map((p) => p?.name ?? p)
    if (!plugins.some((n) => typeof n === 'string' && n.includes('@kerf/media')))
      add(
        'E012',
        'error',
        '`deploy.cdn.images` is Cloudinary, and `@kerf/media` is not in `plugins`: nothing would send it an image',
        '`kerf add media`, or drop `cdn.images`',
      )
    const given = env?.CLOUDINARY_URL
    const cloud = given && /@([\w-]+)\/?$/.exec(given)?.[1]
    if (!images.cloud && !given)
      add(
        'E013',
        'error',
        '`deploy.cdn.images` names no `cloud`, and `CLOUDINARY_URL` is unset: there is no account to send images to',
        "Set `cdn.images.cloud` to the cloud's name, and `CLOUDINARY_URL` in the host's environment (never in a file)",
      )
    else if (cloud && images.cloud && cloud !== images.cloud)
      add(
        'E013',
        'error',
        `\`cdn.images.cloud\` is \`${images.cloud}\`, and \`CLOUDINARY_URL\` here names \`${cloud}\`: one of them is another account`,
        'Make them name the same cloud',
      )
    else if (env && !given)
      add(
        'E013',
        'warning',
        "`CLOUDINARY_URL` is unset here: the server needs it in the host's environment",
        "Set it in the host's environment settings, never in a file",
      )
    add(
      'E014',
      'info',
      "`cdn.images` is checked, but this kerf doesn't send uploads to Cloudinary yet: they still go to `media({ server: { dir } })`",
      'Nothing yet: research 46 §9 is the plan. On a function host, uploads need a server host with a disk until then (E003)',
    )
  }
  return out
}
