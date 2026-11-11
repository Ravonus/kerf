import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, resolveConfig, type PluginOption } from 'vite'
import kerfStart from '../src/vite.mjs'
import { createState } from '../src/vite/state.mjs'
import { configHook, writeBundle, renderChunk, configResolved } from '../src/vite/config-hooks.mjs'
import { configureServer, hotUpdate } from '../src/vite/dev-hooks.mjs'
import { resolveId, load, transform, api } from '../src/vite/module-hooks.mjs'

function original(root: string): PluginOption {
  const s = createState({ root, hydration: 'full' })
  return {
    name: 'kerf:start',
    enforce: 'pre',
    config: configHook(s),
    writeBundle: writeBundle(s),
    renderChunk: renderChunk(s),
    configResolved: configResolved(s),
    configureServer: configureServer(s),
    hotUpdate: hotUpdate(s),
    resolveId: resolveId(s),
    load: load(s),
    transform: transform(s),
    api: api(s),
  } as PluginOption
}

async function snapshot(root: string, plugin: PluginOption) {
  const server = await createServer({
    configFile: false,
    root,
    plugins: [plugin],
    server: { middlewareMode: true, watch: { ignored: ['**/*'] } },
    appType: 'custom',
    logLevel: 'silent',
  })
  try {
    const out: Record<string, unknown> = {}
    for (const env of ['client', 'ssr'] as const) {
      const container = server.environments[env].pluginContainer
      for (const name of [
        'routes',
        'app',
        'entry-server',
        'entry-client',
        'fns',
        'context',
        'auth',
        'migrations',
        'media',
        'realtime',
        'extensions',
      ]) {
        const id = await container.resolveId(`virtual:kerf/${name}`)
        out[`${env}:${name}`] = id && (await container.load(id.id))
      }
    }
    const config = server.config
    const exposed = config.plugins.find((p) => p.name === 'kerf:start')!.api as {
      manifest: () => unknown
      types: () => unknown
      serverModules: () => unknown
    }
    return {
      out,
      root: config.root,
      ssr: config.ssr,
      optimizeDeps: config.optimizeDeps.exclude,
      api: [exposed.manifest(), exposed.types(), exposed.serverModules()],
    }
  } finally {
    await server.close()
  }
}

async function buildSnapshot(root: string, plugin: PluginOption) {
  const config = await resolveConfig(
    { configFile: false, root, plugins: [plugin], logLevel: 'silent' },
    'build',
  )
  const virtual =
    config.plugins.find((p) => p.name === 'kerf:start:modules') ??
    config.plugins.find((p) => p.name === 'kerf:start')!
  const loader = virtual.load as { handler: (this: unknown, id: string) => Promise<string> }
  const app = await loader.handler.call(
    { environment: { config: { consumer: 'server' } } },
    '\0virtual:kerf/app',
  )
  return { app, root: config.root, ssr: config.ssr, optimizeDeps: config.optimizeDeps.exclude }
}

test('kerfStart exposes ordered plugins for its concerns', () => {
  const plugins = kerfStart({ hydration: 'full' })
  expect(Array.isArray(plugins)).toBe(true)
  expect(plugins.map((p) => [p.name, p.enforce, 'apply' in p ? p.apply : undefined])).toEqual([
    ['kerf:start', 'pre', undefined],
    ['kerf:start:sheets', 'pre', undefined],
    ['kerf:start:dev', 'pre', undefined],
    ['kerf:start:modules', 'pre', undefined],
  ])
  expect(plugins[0]).toMatchObject({ config: expect.any(Function), api: expect.any(Object) })
  expect(plugins[1]).toMatchObject({
    writeBundle: expect.any(Object),
    renderChunk: expect.any(Object),
  })
  expect(plugins[2]).toMatchObject({
    configureServer: expect.any(Function),
    hotUpdate: expect.any(Function),
  })
  expect(plugins[3]).toMatchObject({
    resolveId: expect.any(Object),
    load: expect.any(Object),
    transform: expect.any(Object),
  })
})

test('Vite receives unchanged configuration and virtual modules', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'kerf-t05-')))
  mkdirSync(join(root, 'src/routes'), { recursive: true })
  writeFileSync(
    join(root, 'src/routes/index.tsx'),
    'export default function Page() { return null }\n',
  )
  const now = vi.spyOn(Date, 'now').mockReturnValue(1730000000000)
  try {
    const dev = await snapshot(root, kerfStart({ root, hydration: 'full' }))
    expect(dev.out['client:routes']).toBeTruthy()
    expect(dev.out['ssr:routes']).toBeTruthy()
    expect(dev.out['ssr:app']).toBeTruthy()
    expect(dev).toEqual(await snapshot(root, original(root)))
    const build = await buildSnapshot(root, kerfStart({ root, hydration: 'full' }))
    expect(build.app).toMatch(/export const build = "[a-f0-9]{8}"/)
    expect(build).toEqual(await buildSnapshot(root, original(root)))
  } finally {
    now.mockRestore()
    rmSync(root, { recursive: true, force: true })
  }
})
