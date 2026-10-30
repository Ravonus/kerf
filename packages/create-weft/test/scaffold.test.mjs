// Each `--ui` variant scaffolds an app that `weft check` passes clean and `weft dev` server-renders. The workspace
// packages stand in for the npm ones through node_modules links.
import { mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { check } from '../../cli/src/check.mjs'
import { devCommand } from '../../cli/src/start.mjs'
import { scaffold, template } from '../src/index.mjs'

const tmp = fileURLToPath(new URL('./.tmp/', import.meta.url))
const pkgs = fileURLToPath(new URL('../../', import.meta.url))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

const freePort = () => new Promise(ok => { const s = createServer().listen(0, () => { const { port } = s.address(); s.close(() => ok(port)) }) })

function app(ui) {
  const dir = join(tmp, `app-${ui}`)
  rmSync(dir, { recursive: true, force: true })
  scaffold(dir, { ui })
  const deps = Object.keys({ ...JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dependencies, '@weft/cli': 1 })
  for (const name of deps) {
    mkdirSync(join(dir, 'node_modules', '@weft'), { recursive: true })
    symlinkSync(join(pkgs, name.replace('@weft/', '')), join(dir, 'node_modules', name), 'dir')
  }
  return dir
}

describe.each([
  ['warp', /data-scope="surface"[^>]*><span[^>]*data-part="eyebrow">weft \+ warp<\/span><span[^>]*data-part="title">Welcome to App Warp</, /<button[^>]*data-scope="button">/],
  ['headless', /<section[^>]*class="card"><h1>Welcome to App Headless<\/h1>/, /<button type="button">Clicked <!--\[-->0<!--\]--> times/],
  ['none', /<section[^>]*class="card"><h1>Welcome to App None<\/h1>/, /<button type="button">Clicked <!--\[-->0<!--\]--> times/],
])('--ui %s', (ui, card, button) => {
  it('weft check is clean, and / server-renders', async () => {
    const dir = app(ui)
    const r = await check(dir)
    expect(r.diagnostics.filter(d => d.severity === 'error')).toEqual([])
    expect(r.diagnostics).toEqual([])

    const server = await devCommand(dir, { port: await freePort() })
    try {
      const res = await fetch(server.resolvedUrls.local[0])
      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toMatch(card)
      expect(html).toMatch(button)
      expect(html).toContain('<a wk')
      expect(html).toMatch(/<title[^>]*>App \w+<\/title>/)
    } finally {
      await server.close()
    }
  })
})

it('the template: warp() only for warp, a stylesheet otherwise, and only weft scripts', () => {
  const warp = template({ ui: 'warp', name: 'shop' })
  expect(warp['weft.config.ts']).toContain("import { warp } from '@weft/warp/plugin'")
  expect(warp['weft.config.ts']).toContain('plugins: [warp()]')
  expect(warp['src/app.css']).toBeUndefined()
  expect(JSON.parse(warp['package.json']).scripts).toEqual({ dev: 'weft dev', build: 'weft build', check: 'weft check' })
  const headless = template({ ui: 'headless' })
  expect(Object.keys(JSON.parse(headless['package.json']).dependencies)).toEqual(['weft', '@weft/start', '@weft/ui-core'])
  expect(headless['src/routes/_layout.tsx']).toContain("import '@weft/ui-core/styles/warp.css'")
  expect(template({ ui: 'none' })['weft.config.ts']).not.toContain('plugins')
  expect(() => template({ ui: 'tailwind' })).toThrow('--ui must be one of warp, headless, none')
})

it('refuses a non-empty directory', () => {
  const dir = join(tmp, 'full')
  mkdirSync(dir, { recursive: true })
  rmSync(join(dir, 'x'), { force: true })
  symlinkSync(pkgs, join(dir, 'x'))
  expect(() => scaffold(dir)).toThrow('is not empty')
})
