// One `weft dev` (Vite + weftStart + Nitro) for the fixture app, shared by the e2e tests: they fetch it as a crawler
// would (no JS) and drive it in Chrome. The URL goes to tests through `inject('url')`.
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { dev } from '../src/app.mjs'

export const fixture = fileURLToPath(new URL('./fixtures/app', import.meta.url))
export const site = {
  name: 'Acme', url: 'https://acme.dev', title: '%s · Acme', description: 'Tools for builders.', locale: 'en_US', image: 'auto',
  twitter: { card: 'summary_large_image', site: '@acme' },
}

const freePort = () => new Promise(ok => { const s = createServer().listen(0, () => { const { port } = s.address(); s.close(() => ok(port)) }) })

export default async function setup({ provide }) {
  const server = await dev({ root: fixture, site, port: await freePort(), logLevel: 'error' })
  provide('url', server.resolvedUrls.local[0].replace(/\/$/, ''))
  return () => server.close()
}
