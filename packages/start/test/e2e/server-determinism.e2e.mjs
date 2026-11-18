// Compare the CLI's entire release in fresh processes and serve it via the built Node entry.
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { until } from '../../../../scripts/lib/helpers.mjs'

const fixture = join(import.meta.dirname, '../fixtures/reproducible')
const packages = join(import.meta.dirname, '../../..')
const cli = join(packages, 'cli/bin/kerf.mjs')
const epoch = '1700000000'
const run = promisify(execFile)

async function link(root, name, target) {
  const file = join(root, 'node_modules', name)
  await mkdir(dirname(file), { recursive: true })
  await symlink(target, file, 'junction')
}

async function copyApp(root, library, mtime) {
  await cp(join(fixture, 'app'), root, { recursive: true })
  const dependencies = [
    ['@kerf-js/start', join(packages, 'start')],
    ['@kerf-js/core', join(packages, 'core')],
    ['@takumi-rs/core', join(packages, 'start/node_modules/@takumi-rs/core')],
    ['zod', join(packages, 'start/node_modules/zod')],
    ['release-library', library],
  ]
  for (const [name, target] of dependencies) await link(root, name, target)
  for (const file of ['public/payload.txt', 'server/assets/example.txt'])
    await utimes(join(root, file), mtime, mtime)
}

async function build(root, mode, cwd = root) {
  await run(process.execPath, [cli, 'build', '--runtime', 'node', '--root', root], {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SOURCE_DATE_EPOCH: epoch,
      RELEASE_SHELL: mode === 'shell' ? '1' : '0',
    },
    timeout: 60_000,
  })
}

async function inventory(root) {
  const output = join(root, '.output')
  const entries = await readdir(output, { recursive: true, withFileTypes: true })
  assert.ok(entries.every((entry) => entry.isFile() || entry.isDirectory()))
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      join(entry.parentPath, entry.name)
        .slice(output.length + 1)
        .replaceAll('\\', '/'),
    )
    .sort()
  // The contract is a separate CLI deliverable, outside .output.
  files.push('../.kerf/contract.json')
  return new Map(
    await Promise.all(files.map(async (file) => [file, await readFile(join(output, file))])),
  )
}

function identical(left, right) {
  assert.deepEqual([...left.keys()], [...right.keys()], 'emitted file inventory')
  for (const [file, contents] of left)
    assert.ok(contents.equals(right.get(file)), `bytes differ in ${file}`)
}

function noCheckoutPaths(files, roots) {
  for (const [file, bytes] of files) {
    const contents = file.endsWith('.br')
      ? brotliDecompressSync(bytes)
      : file.endsWith('.gz')
        ? gunzipSync(bytes)
        : bytes
    for (const root of roots) {
      const path = root.replaceAll('\\', '/')
      assert.ok(!contents.includes(path), `absolute checkout path in ${file}`)
      assert.ok(!contents.includes(encodeURIComponent(path)), `encoded checkout path in ${file}`)
    }
  }
}

async function listenPort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  server.close()
  await once(server, 'close')
  return port
}

async function serve(t, root) {
  const port = await listenPort()
  const child = spawn(process.execPath, ['.output/server/index.mjs'], {
    cwd: root,
    stdio: 'ignore',
    env: { ...process.env, HOST: '127.0.0.1', NITRO_HOST: '127.0.0.1', NITRO_PORT: String(port) },
  })
  const closed = once(child, 'close')
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    await closed
  })
  const url = `http://127.0.0.1:${port}`
  await until('built Node server', async () => (await fetch(url + '/_kerf/ready')).ok, 5000)
  return url
}

async function validators(t, root, files) {
  const url = await serve(t, root)
  const mtime = new Date(Number(epoch) * 1000).toUTCString()
  for (const [encoding, suffix] of [
    ['identity', ''],
    ['gzip', '.gz'],
    ['br', '.br'],
  ]) {
    const payload = files.get('public/payload.txt' + suffix)
    assert.ok(payload, `missing ${encoding} variant`)
    const digest = createHash('sha1').update(payload).digest('base64').slice(0, 27)
    const etag = `"${payload.length.toString(16)}-${digest}"`
    const get = (headers = {}) =>
      fetch(url + '/payload.txt', { headers: { 'accept-encoding': encoding, ...headers } })
    const reply = await get()
    assert.equal(reply.status, 200)
    assert.equal(reply.headers.get('etag'), etag)
    assert.equal(reply.headers.get('last-modified'), mtime)
    assert.equal(reply.headers.get('content-encoding'), suffix ? encoding : null)
    assert.deepEqual(Buffer.from(await reply.arrayBuffer()), files.get('public/payload.txt'))
    assert.equal((await get({ 'if-none-match': etag })).status, 304)
    assert.equal((await get({ 'if-modified-since': mtime })).status, 304)
    const stale = await get({ 'if-modified-since': new Date(0).toUTCString() })
    assert.equal(stale.status, 200)
    await stale.body.cancel()
  }
  const home = await fetch(url + '/').then((response) => response.text())
  assert.match(home, /Linked island/)
  assert.match(home, /node_modules\/release-library\/panel\.tsx#0/)
  const details = await fetch(url + '/details').then((response) => response.text())
  assert.match(details, /Release message A/)
  assert.equal(
    await fetch(url + '/api/fixture').then((response) => response.text()),
    'Nitro fixture route',
  )
}

async function verifyMode(t, dir, mode, library) {
  const a = join(dir, mode, 'a')
  const b = join(dir, mode, 'a different', 'checkout', 'b')
  const alias = join(dir, mode, 'linked-b')
  await copyApp(a, library, 946684800)
  await copyApp(b, library, 1670839932)
  await symlink(b, alias, 'junction')
  await build(a, mode)
  const cold = await inventory(a)
  await build(alias, mode, dirname(packages))
  const relocated = await inventory(b)
  identical(cold, relocated)
  noCheckoutPaths(relocated, [a, b, alias, library, dirname(packages)])
  assert.equal(JSON.parse(cold.get('nitro.json')).date, '2023-11-14T22:13:20.000Z')
  assert.equal(JSON.parse(cold.get('../.kerf/contract.json')).functions.length, 1)
  assert.equal(cold.has('public/kerf-shell.html'), mode === 'shell')
  assert.ok(cold.has('public/.vite/manifest.json'))
  assert.ok(cold.has('server/.vite/ssr-manifest.json'))
  assert.ok(
    [...cold.keys()].some((file) => file.startsWith('server/') && file.endsWith('.mjs.map')),
  )
  // Present in a real warm checkout from a previous build without an epoch.
  await mkdir(join(a, '.kerf/sheets'), { recursive: true })
  await writeFile(join(a, '.kerf/sheets/sheet-previous.css'), 'p{color:rebeccapurple}')
  await build(a, mode)
  const warm = await inventory(a)
  identical(cold, warm)
  noCheckoutPaths(warm, [a, b, alias, library, dirname(packages)])
  if (mode === 'ssr')
    await t.test('serves static validators and the island and function', (sub) =>
      validators(sub, b, cold),
    )
  const source = join(b, 'src/server/message.ts')
  await writeFile(source, (await readFile(source, 'utf8')).replace('message A', 'message B'))
  await build(b, mode)
  const changed = await inventory(b)
  assert.ok(!cold.get('server/_ssr/ssr.mjs').equals(changed.get('server/_ssr/ssr.mjs')))
  t.diagnostic(
    `${mode}: ${cold.size - 1} identical .output files (${[...cold.keys()].filter((f) => /\.(br|gz)$/.test(f)).length} compressed), plus the contract`,
  )
}

void test(
  'production output across relocated checkouts and a warm cache',
  { timeout: 150_000 },
  async (t) => {
    const dir = await mkdtemp(join(await realpath(tmpdir()), 'kerf-determinism-'))
    t.after(() => rm(dir, { recursive: true, force: true }))
    const library = join(dir, 'linked')
    await cp(join(fixture, 'library'), library, { recursive: true })
    await link(library, '@kerf-js/core', join(packages, 'core'))
    await t.test('default SSR', (sub) => verifyMode(sub, dir, 'ssr', library))
    await t.test('shell', (sub) => verifyMode(sub, dir, 'shell', library))
  },
)
