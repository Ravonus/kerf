// One `weft dev` (Vite + weftStart + Nitro) for the fixture app, shared by the e2e tests: they fetch it as a crawler
// would (no JS) and drive it in Chrome. The URL goes to tests through `inject('url')`.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dev } from '../src/app.mjs'

export const fixture = fileURLToPath(new URL('./fixtures/app', import.meta.url))
export const site = {
  name: 'Acme', url: 'https://acme.dev', title: '%s · Acme', description: 'Tools for builders.', locale: 'en_US', image: 'auto',
  twitter: { card: 'summary_large_image', site: '@acme' },
}

const freePort = () => new Promise(ok => { const s = createServer().listen(0, () => { const { port } = s.address(); s.close(() => ok(port)) }) })

/** Bind a font.build provider the way `weft plugins sync` does, so the head carries font preloads. */
function bindFonts() {
  const dir = join(fixture, '.weft', 'slots')
  mkdirSync(dir, { recursive: true })
  const module = fileURLToPath(new URL('./fixtures/font-provider.mjs', import.meta.url))
  writeFileSync(join(dir, 'font.build.build.json'), JSON.stringify({ plugin: '@test/fonts', version: '0.0.0', module, export: 'createFontBuild' }))
  // The media route, as `weft plugins sync` binds @weft/plugin-media's media.server@1.
  const media = fileURLToPath(new URL('../../plugin-media/src/server.mjs', import.meta.url))
  writeFileSync(join(dir, 'media.server.ts'), `export const provider = { plugin: '@weft/plugin-media' }\nexport const load = () => import(${JSON.stringify(media)}).then(m => m.createMediaServer({ formats: ['avif', 'webp'], widths: [64, 128] }))\n`)
  return () => rmSync(join(fixture, '.weft'), { recursive: true, force: true })
}

export default async function setup({ provide }) {
  const unbind = bindFonts()
  const server = await dev({ root: fixture, site, port: await freePort(), logLevel: 'error' })
  provide('url', server.resolvedUrls.local[0].replace(/\/$/, ''))
  return async () => {
    await server.close()
    unbind()
  }
}
