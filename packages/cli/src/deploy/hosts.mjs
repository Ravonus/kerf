// The hosts `weft deploy` knows (research 46 §3): what each can run, its preset, what its CLI reads, and a cost hint.
// The fit (fit.mjs) and the generated files (files.mjs) both read this table, so they can't disagree about a host.

/**
 * @typedef {{
 *   id: string, name: string, kind: 'functions' | 'workers' | 'server',
 *   preset?: string, sockets: boolean, held: boolean, disk: 'none' | 'volume' | 'paid-disk', sidecars: boolean,
 *   many: boolean, prebuilt: boolean, env: string[], cost: string, pricing: string, docs: string, deploys: boolean,
 * }} Host
 * `preset`: the Nitro preset, or none for the runtime's server preset. `prebuilt`: what is built here is what ships, so a
 * native addon from this machine goes too. `deploys`: `weft deploy` drives it (AWS is a fit only, research 46 §11).
 */

/** @type {Host[]} */
export const HOSTS = [
  {
    id: 'netlify', name: 'Netlify', kind: 'functions', preset: 'netlify', sockets: false, held: false, disk: 'none', sidecars: false, many: true, prebuilt: true,
    env: ['NETLIFY_AUTH_TOKEN', 'NETLIFY_SITE_ID'], deploys: true,
    cost: 'free tier; usage past it is billed in credits', pricing: 'https://www.netlify.com/pricing/', docs: 'https://docs.netlify.com/cli/get-started/',
  },
  {
    id: 'vercel', name: 'Vercel', kind: 'functions', preset: 'vercel', sockets: false, held: false, disk: 'none', sidecars: false, many: true, prebuilt: true,
    env: ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'], deploys: true,
    cost: 'Hobby is free for non-commercial use; Pro is per seat', pricing: 'https://vercel.com/pricing', docs: 'https://vercel.com/docs/cli',
  },
  {
    id: 'cloudflare', name: 'Cloudflare Workers', kind: 'workers', preset: 'cloudflare_durable', sockets: true, held: false, disk: 'none', sidecars: false, many: true, prebuilt: true,
    env: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'], deploys: true,
    cost: 'free tier includes Workers and SQLite-backed Durable Objects', pricing: 'https://developers.cloudflare.com/workers/platform/pricing/', docs: 'https://developers.cloudflare.com/workers/wrangler/',
  },
  {
    id: 'fly', name: 'Fly.io', kind: 'server', sockets: true, held: true, disk: 'volume', sidecars: true, many: false, prebuilt: false,
    env: ['FLY_API_TOKEN'], deploys: true,
    cost: 'pay as you go, no free tier for new organizations', pricing: 'https://fly.io/docs/about/pricing/', docs: 'https://fly.io/docs/flyctl/',
  },
  {
    id: 'render', name: 'Render', kind: 'server', sockets: true, held: true, disk: 'paid-disk', sidecars: true, many: false, prebuilt: false,
    env: ['RENDER_DEPLOY_HOOK_URL'], deploys: true,
    cost: 'free instance sleeps after 15 idle minutes and has no disk; paid plans add a disk', pricing: 'https://render.com/pricing', docs: 'https://render.com/docs/blueprint-spec',
  },
  {
    id: 'aws', name: 'AWS Lambda', kind: 'functions', preset: 'aws_lambda', sockets: false, held: false, disk: 'none', sidecars: false, many: true, prebuilt: true,
    env: [], deploys: false,
    cost: 'Lambda has a free tier; a server would go on App Runner, billed per running instance', pricing: 'https://aws.amazon.com/pricing/', docs: 'https://nitro.build/deploy/providers/aws',
  },
]

export const TARGETS = HOSTS.filter(h => h.deploys).map(h => h.id)

export const host = id => HOSTS.find(h => h.id === id)

/** `runtime` in the config as the server preset a container runs. */
const SERVER_PRESETS = { node: 'node', bun: 'bun', deno: 'deno_server' }

/** The preset a build for this host uses. */
export const presetFor = (h, runtime = 'node') => h.preset ?? SERVER_PRESETS[runtime] ?? 'node'
