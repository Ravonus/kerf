#!/usr/bin/env node
// Exercise the public landing scaffold against packages packed from this checkout.
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { packWithAddon } from '../../scripts/pack-all.mjs'
import { writePackedPolicy } from '../../scripts/tarballs.mjs'
import { findChrome } from '../../scripts/cdp.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const entry = 'packages/create/test/e2e/instant-navigation.mjs'
const profiles = [
  { name: 'Fast 3G', latency: 150, downloadThroughput: 1600000 / 8, uploadThroughput: 750000 / 8 },
  { name: 'Slow 3G', latency: 400, downloadThroughput: 400000 / 8, uploadThroughput: 400000 / 8 },
]
const cases = ['cold', 'warm', 'history', 'search', 'rapid', 'mutation', 'keyboard', 'native',
  'overrides', 'save-data', 'touch-cancel', 'late-skeleton', 'wrong-height']

function command(bin, args, cwd) {
  execFileSync(bin, args, { cwd, stdio: 'inherit' })
}

function checkEntries() {
  const tracked = execFileSync('git', ['ls-files', '--', 'packages/create/test/e2e/instant-navigation.mjs'],
    { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  const selected = [entry]
  console.log(`entrypoints: ${selected.length} selected, ${tracked.length} tracked`)
  if (!tracked.length || tracked.length !== selected.length || tracked[0] !== entry)
    throw new Error('tracked entrypoint coverage mismatch')
}

function prepare(dir) {
  const tgz = join(dir, 'tgz')
  const app = join(dir, 'app')
  const tarballs = packWithAddon(tgz)
  writeFileSync(join(tgz, 'tarballs.json'), JSON.stringify(tarballs))
  command(process.execPath, [join(root, 'packages/create/bin/create-weft.mjs'), app,
    '--template', 'landing', '--pm', 'pnpm', '--no-install', '--no-git', '--yes',
    '--tarballs', tgz], root)
  writePackedPolicy(app, tarballs)
  command('pnpm', ['install', '--no-frozen-lockfile'], app)
  command('pnpm', ['run', 'build'], app)
  return app
}

async function waitForServer(server, url) {
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error(`server exited: ${server.exitCode}`)
    const response = await fetch(url).catch(() => null)
    if (response?.ok) return
    await new Promise((done) => setTimeout(done, 250))
  }
  throw new Error('built server did not become ready')
}

async function profile(browser, settings, url) {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    const { name, ...network } = settings
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, ...network })
    console.log(`${name}: configured ${JSON.stringify(network)}`)
    await page.goto(url, { waitUntil: 'networkidle' })
    if (!await page.locator('a[href="/pricing"]').count()) throw new Error('pricing link missing')
    // A loaded document alone does not establish router readiness or count as a case.
    for (const name of cases) console.log(`${settings.name} ${name}: 0 executed`)
    throw new Error(`${settings.name}: acceptance cases are not implemented`)
  } finally {
    await context.close()
  }
}

async function main() {
  checkEntries()
  const require = createRequire(resolve(root, 'packages/start/package.json'))
  const { chromium } = await import(require.resolve('playwright-core'))
  const chrome = findChrome()
  if (!chrome) throw new Error('Chrome is required; set CHROME to its executable')
  const dir = mkdtempSync(join(tmpdir(), 'weft-navigation-'))
  let server, browser
  try {
    const app = prepare(dir)
    const port = 5198
    const url = `http://127.0.0.1:${port}/`
    server = spawn(process.execPath, ['.output/server/index.mjs'], {
      cwd: app, env: { ...process.env, PORT: String(port) }, stdio: 'inherit',
    })
    await waitForServer(server, url)
    browser = await chromium.launch({ executablePath: chrome, headless: true })
    const failures = []
    for (const settings of profiles) {
      try { await profile(browser, settings, url) } catch (error) { failures.push(error.message) }
    }
    if (failures.length) throw new Error(failures.join('\n'))
  } finally {
    await browser?.close()
    if (server && server.exitCode === null) {
      server.kill()
      await new Promise((done) => server.once('exit', done))
    }
    rmSync(dir, { recursive: true, force: true })
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
