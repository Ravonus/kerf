import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { entry } from '../src/catalog.mjs'
import { cdnFindings, writtenSecrets } from '../src/deploy/cdn.mjs'
import { fileStates, filesFor, writeFiles } from '../src/deploy/files.mjs'
import { fit, suggest } from '../src/deploy/fit.mjs'
import { host } from '../src/deploy/hosts.mjs'
import {
  deployChecks,
  deployCommand as deployCommandRaw,
  hostsCommand,
  initCommand as initCommandRaw,
  initContext,
  urlFrom,
  withDeploy,
} from '../src/deploy/index.mjs'
import { needsOf } from '../src/deploy/needs.mjs'
import { unsafeAllowed } from '../src/start.mjs'

type DeployOptions = {
  yes?: boolean
  prod?: boolean
  env?: NodeJS.ProcessEnv
  which?: (cmd: string) => boolean
  build?: (
    dir: string,
    opts: { preset: string },
  ) => void | Promise<{ ok: boolean; diagnostics: unknown[] }>
  exec?: (cmd: string, args: string[]) => void | Promise<{ code: number; stdout: string }>
  post?: (url: string) => Promise<{ ok: boolean }>
}
const deployCommand = deployCommandRaw as unknown as (
  dir: string,
  config: Record<string, unknown>,
  options: DeployOptions,
) => ReturnType<typeof deployCommandRaw>
const initCommand = initCommandRaw as unknown as (
  dir: string,
  config: Record<string, unknown>,
  options?: {
    target?: string
    force?: boolean
    dryRun?: boolean
    unsafe?: ReturnType<typeof unsafeAllowed>
  },
) => ReturnType<typeof initCommandRaw>

const tmp = fileURLToPath(new URL('./.tmp/', import.meta.url))
const made: string[] = []
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true })
})

/** A bare app: just the files given. */
function app(files = {}) {
  mkdirSync(tmp, { recursive: true })
  const dir = mkdtempSync(join(tmp, 'deploy-'))
  made.push(dir)
  const all = {
    'package.json': '{ "name": "@acme/shop", "dependencies": {} }',
    'kerf.config.ts':
      "import { defineConfig } from '@kerf-js/core/config'\n\nexport default defineConfig({\n  site: { name: 'Shop' },\n})\n",
    'src/routes/index.tsx': 'export default () => <h1>Shop</h1>\n',
    ...files,
  }
  for (const [rel, text] of Object.entries(all)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  return dir
}

const CHAT = {
  'src/server/chat.server.ts':
    "import { channel } from '@kerf-js/start/channel'\nexport const chat = channel({ authorize: () => true })\n",
}
const SQLITE = {
  'src/db/index.server.ts':
    "import { createDb } from '@kerf-js/start/db/sqlite'\nexport const db = createDb({ schema: {} })\n",
}

describe('needs', () => {
  it('a page app needs nothing a function host lacks', () => {
    const needs = needsOf(app())
    expect(Object.keys(needs)).toEqual(['runtime'])
    expect(suggest(needs)).toMatchObject({ host: 'netlify', alternative: 'vercel' })
  })

  it('finds a channel, the memory bus, SQLite, uploads, a sidecar, a required live query and an addon, with where', () => {
    const needs = needsOf(
      app({
        ...CHAT,
        ...SQLITE,
        'src/server/search.server.ts':
          "import { remote } from '@kerf-js/start/rust'\nexport const search = remote('rust://search')\n",
        'src/routes/feed.tsx':
          'export default () => { const f = feed.live({}, { required: true }); return <p>{f.value}</p> }\n',
        'src/server/upload.server.ts':
          'export const up = mutation({ input: z.object({ file: z.media() }) })\n',
        'kerf.config.ts':
          "export default { plugins: [media()] }\nimport media from '@kerf-js/media'\n",
        'package.json': '{ "dependencies": { "sharp": "1.0.0" } }',
      }),
    )
    expect(needs.sockets).toEqual({ file: 'src/server/chat.server.ts', what: 'a `channel`' })
    expect(needs.memoryBus).toBeTruthy()
    expect(needs.sqlite!.file).toBe('src/db/index.server.ts')
    expect(needs.uploads!.what).toBe('media uploads')
    expect(needs.sidecar!.what).toBe("`remote('rust://search')`")
    expect(needs.required!.file).toBe('src/routes/feed.tsx')
    expect(needs.addons!.what).toBe('`sharp`')
  })

  it('a named bus, an external sidecar and an external listener are not needs', () => {
    const needs = needsOf(
      app({
        ...CHAT,
        'src/realtime.server.ts':
          "export default realtime({ bus: postgresBus({ url: process.env.DATABASE_URL }), changes: dbChanges(db, ['t'], { listener: 'external' }) })\n",
        'src/server/search.server.ts':
          "import { remote } from '@kerf-js/start/rust'\nexport const search = remote('rust://search')\n",
      }),
      { rust: { services: { search: { external: true } } } },
    )
    expect(needs.memoryBus).toBeUndefined()
    expect(needs.sidecar).toBeUndefined()
    expect(needs.feed).toBeUndefined()
  })
})

describe('fit', () => {
  const chat = () => needsOf(app(CHAT))

  it("E001: a channel can't run on Netlify or Vercel, and runs on Fly and Render", () => {
    const n = chat()
    for (const id of ['netlify', 'vercel']) {
      const r = fit(n, host(id)!)
      expect(r.fits).toBe(false)
      expect(r.findings[0]).toMatchObject({
        code: 'E001',
        severity: 'error',
        file: 'src/server/chat.server.ts',
      })
      expect(r.findings[0]!.why).toContain('R024')
    }
    for (const id of ['fly', 'render']) expect(fit(n, host(id)!).fits).toBe(true)
    expect(suggest(n)).toMatchObject({ host: 'fly', alternative: 'render' })
  })

  it('suggests Cloudflare for a channel once the bus is a Durable Object', () => {
    const n = needsOf(
      app({
        ...CHAT,
        'src/realtime.server.ts':
          'export default realtime({ bus: durableObjectBus({ namespace }) })\n',
      }),
    )
    expect(fit(n, host('cloudflare')!).findings).toEqual([])
    expect(suggest(n).host).toBe('cloudflare')
  })

  it('E003: SQLite needs a volume on Fly, a disk on Render, and is out on a function host', () => {
    const n = needsOf(app(SQLITE))
    expect(fit(n, host('netlify')!).findings[0]).toMatchObject({ code: 'E003', severity: 'error' })
    expect(fit(n, host('fly')!).findings[0]).toMatchObject({ code: 'E003', severity: 'error' })
    expect(fit(n, host('fly')!, { assume: true }).findings[0]!.severity).toBe('warning')
    expect(
      fit(n, host('fly')!, { deploy: { fly: { volume: { name: 'data' } } } }).findings,
    ).toEqual([])
    expect(
      fit(n, host('render')!, { deploy: { render: { disk: { sizeGb: 1 } } } }).findings,
    ).toEqual([])
    expect(suggest(n).host).toBe('fly')
  })

  it('E002: a sidecar or a required live query needs a held server', () => {
    const n = needsOf(
      app({
        'src/server/s.server.ts':
          "import { remote } from '@kerf-js/start/rust'\nexport const s = remote('rust://s')\n",
      }),
    )
    expect(fit(n, host('vercel')!).findings.map((f) => f.code)).toEqual(['E002'])
    expect(fit(n, host('render')!).fits).toBe(true)
  })

  it("E004 only for a prebuilt deploy from a machine that isn't Linux", () => {
    const n = needsOf(app({ 'package.json': '{ "dependencies": { "better-sqlite3": "1" } }' }))
    const codes = fit(n, host('netlify')!, { local: true }).findings.map((f) => f.code)
    expect(codes).toEqual(process.platform === 'linux' ? [] : ['E004'])
    expect(fit(n, host('netlify')!).findings).toEqual([])
    expect(fit(n, host('fly')!, { local: true }).findings).toEqual([]) // Fly builds the image itself
  })
})

describe('files', () => {
  it("writes each target's files, stamped, and knows current, stale and edited", () => {
    const dir = app(SQLITE)
    const config = { deploy: { target: 'fly', fly: { app: 'shop', volume: { name: 'data' } } } }
    const files = filesFor(initContext(dir, config, 'fly'))
    expect(files.map((f) => f.path)).toEqual([
      'fly.toml',
      'Dockerfile',
      '.dockerignore',
      '.github/workflows/kerf-deploy.yml',
    ])
    const toml = files[0]!.text
    expect(toml).toMatch(/^# kerf deploy init fly, sha [0-9a-f]{12}\napp = "shop"/)
    expect(toml).toContain('destination = "/app/.data"')
    expect(fileStates(dir, files).map((f: { state: string }) => f.state)).toEqual([
      'missing',
      'missing',
      'missing',
      'missing',
    ])
    expect(writeFiles(dir, fileStates(dir, files))).toHaveLength(4)
    expect(fileStates(dir, files).every((f: { state: string }) => f.state === 'current')).toBe(true)
    // the config moved on: kerf's own file is stale
    const moved = filesFor(
      initContext(
        dir,
        { deploy: { ...config.deploy, fly: { ...config.deploy.fly, region: 'ams' } } },
        'fly',
      ),
    )
    expect(fileStates(dir, moved)[0].state).toBe('stale')
    // a hand edit keeps the old stamp: left alone
    writeFileSync(
      join(dir, 'fly.toml'),
      `${readFileSync(join(dir, 'fly.toml'), 'utf8')}\n[metrics]\n`,
    )
    const states = fileStates(dir, moved)
    expect(states[0].state).toBe('edited')
    expect(writeFiles(dir, states)).not.toContain('fly.toml')
    expect(writeFiles(dir, states, { force: true })).toContain('fly.toml')
  })

  it('the workflow reads every secret by name, and previews only where the host has them', () => {
    const dir = app()
    const netlify = filesFor(initContext(dir, { deploy: { target: 'netlify' } }, 'netlify')).find(
      (f) => f.path.endsWith('.yml'),
    )!.text
    // oxlint-disable-next-line no-template-curly-in-string -- GitHub Actions expressions in the workflow it writes
    expect(netlify).toContain('NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}')
    expect(netlify).toContain('pull_request:')
    // oxlint-disable no-template-curly-in-string -- GitHub Actions expressions in the workflow it writes
    expect(netlify).toContain(
      "npx kerf deploy --yes ${{ github.event_name == 'push' && '--prod' || '' }}",
    ) /* oxlint-enable no-template-curly-in-string */
    const render = filesFor(
      initContext(dir, { deploy: { target: 'render', branch: 'prod' } }, 'render'),
    )
    const wf = render.find((f) => f.path.endsWith('.yml'))!.text
    expect(wf).not.toContain('pull_request:')
    expect(wf).toContain('branches: [prod]')
    expect(render.find((f) => f.path === 'render.yaml')!.text).toContain('autoDeploy: false')
  })

  it("a sidecar's image builds with cargo and runs `kerf start`", () => {
    const dir = app({
      'src/server/s.server.ts':
        "import { remote } from '@kerf-js/start/rust'\nexport const s = remote('rust://s')\n",
    })
    const docker = filesFor(initContext(dir, { deploy: { target: 'fly' } }, 'fly')).find(
      (f) => f.path === 'Dockerfile',
    )!.text
    expect(docker).toContain('rustup')
    expect(docker).toContain('CMD ["npx", "kerf", "start"]')
    const plain = filesFor(initContext(app(), { deploy: { target: 'fly' } }, 'fly')).find(
      (f) => f.path === 'Dockerfile',
    )!.text
    expect(plain).toContain('CMD ["node", ".output/server/index.mjs"]')
    expect(plain).not.toContain('rustup')
  })
})

describe('secrets and CDN', () => {
  it('E008: a token in a committed file, never an env var or a GitHub secret', () => {
    const dir = app({
      'netlify.toml':
        '[build]\n  environment = { NETLIFY_AUTH_TOKEN = "nfp_abcdefghijklmnopqrstuvwx1234" }\n',
      // oxlint-disable no-template-curly-in-string -- GitHub Actions expressions in the workflow it writes
      '.github/workflows/deploy.yml':
        'env:\n  FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}\n  hook: https://api.render.com/deploy/srv-abc123?key=xyz789\n' /* oxlint-enable no-template-curly-in-string */,
      'kerf.config.ts':
        "export default { deploy: { target: 'netlify' }, apiKey: 'abcdef0123456789abcdef', token: process.env.TOKEN }\n",
    })
    expect(writtenSecrets(dir)).toEqual([
      { file: 'kerf.config.ts', line: 1, what: 'a value for `apiKey`' },
      { file: 'netlify.toml', line: 2, what: 'a Netlify token' },
      {
        file: '.github/workflows/deploy.yml',
        line: 3,
        what: 'a Render deploy hook (its key deploys the service)',
      },
    ])
  })

  it('E010–E014: a proxy in front of nothing or of a CDN, Cloudinary half set up', () => {
    const codes = (c: {
      config?: Record<string, unknown>
      env?: NodeJS.ProcessEnv
      [key: string]: unknown
    }) => cdnFindings(c.config ?? c, c.env ? { env: c.env } : {}).map((f) => f.code)
    expect(
      codes({
        site: { url: 'https://shop.fly.dev' },
        deploy: { target: 'fly', cdn: { proxy: 'cloudflare' } },
      }),
    ).toEqual(['E010'])
    expect(
      codes({
        site: { url: 'https://shop.com' },
        deploy: { target: 'vercel', cdn: { proxy: 'cloudflare' } },
      }),
    ).toEqual(['E011'])
    expect(codes({ deploy: { cdn: { images: { provider: 'cloudinary' } } } })).toEqual([
      'E012',
      'E013',
      'E014',
    ])
    const media = {
      plugins: [{ name: '@kerf-js/media' }],
      deploy: { cdn: { images: { provider: 'cloudinary', cloud: 'shop' } } },
    }
    expect(codes(media)).toEqual(['E014'])
    expect(codes({ config: media, env: { CLOUDINARY_URL: 'cloudinary://1:s@other' } })).toEqual([
      'E013',
      'E014',
    ])
    expect(codes({ config: media, env: { CLOUDINARY_URL: 'cloudinary://1:s@shop' } })).toEqual([
      'E014',
    ])
  })

  it('every E-code is in the catalog with a fix', () => {
    for (let n = 1; n <= 14; n++) expect(entry(`E${String(n).padStart(3, '0')}`)?.fix).toBeTruthy()
  })
})

describe('kerf check and doctor', () => {
  it('reports E001 for the configured target, as a diagnostic with the fix, and E006 for its missing files', () => {
    const dir = app(CHAT)
    const d = deployChecks(dir, { deploy: { target: 'netlify' } })
    expect(d.map((x) => x.code)).toEqual(['E001', 'E009', 'E006', 'E006'])
    expect(d[0]).toMatchObject({
      severity: 'error',
      file: 'src/server/chat.server.ts',
      docs: 'kerf docs E001',
    })
    expect((d[0] as unknown as { fix: { text: string } }).fix.text).toContain("target: 'fly'")
    expect(deployChecks(dir, {})).toEqual([]) // no target: check stays quiet; doctor says E005
    expect(deployChecks(dir, {}, { preset: 'vercel' }).map((x) => x.code)).toEqual(['E001', 'E009'])
  })

  it('doctor: every host and the suggestion, E005 without a target', () => {
    const r = hostsCommand(app(CHAT), {})
    expect(r.suggestion.host).toBe('fly')
    expect(r.fits.find((f) => f.host === 'netlify')!.fits).toBe(false)
    expect(r.diagnostics).toMatchObject([{ code: 'E005', severity: 'info' }])
  })
})

describe('kerf deploy init', () => {
  it('picks the suggestion, records `deploy` in the config, writes the files, and lists what to run once', () => {
    const dir = app(SQLITE)
    const r = initCommand(dir, {})
    expect(r.target).toBe('fly')
    const config = readFileSync(join(dir, 'kerf.config.ts'), 'utf8')
    expect(config).toContain(
      "deploy: { target: 'fly', fly: { app: 'shop', region: 'iad', volume: { name: 'data', sizeGb: 1 } }, ci: 'github', branch: 'main' },",
    )
    expect(r.written).toEqual([
      'fly.toml',
      'Dockerfile',
      '.dockerignore',
      '.github/workflows/kerf-deploy.yml',
    ])
    expect(r.next.join('\n')).toContain('flyctl volumes create data --size 1')
  })

  it("refuses a target the app can't run on, unless --unsafe-allow, and changes nothing", () => {
    const dir = app(CHAT)
    const before = readFileSync(join(dir, 'kerf.config.ts'), 'utf8')
    expect(() => initCommand(dir, {}, { target: 'netlify' })).toThrow(
      /E001 src\/server\/chat\.server\.ts[\s\S]*Nothing was changed/,
    )
    expect(readFileSync(join(dir, 'kerf.config.ts'), 'utf8')).toBe(before)
    expect(
      initCommand(dir, {}, { target: 'netlify', dryRun: true, unsafe: unsafeAllowed('E001') })
        .written,
    ).toEqual([])
  })

  it('a dry run writes nothing', () => {
    const dir = app()
    const r = initCommand(dir, {}, { dryRun: true })
    expect(r.target).toBe('netlify')
    expect(r.actions).toContain('netlify.toml: write')
    expect(readFileSync(join(dir, 'kerf.config.ts'), 'utf8')).not.toContain('deploy')
  })

  it('writes a config when the app has none', () => {
    const dir = app()
    rmSync(join(dir, 'kerf.config.ts'))
    initCommand(dir, {})
    expect(readFileSync(join(dir, 'kerf.config.ts'), 'utf8')).toBe(
      "import { defineConfig } from '@kerf-js/core/config'\n\nexport default defineConfig({\n  deploy: { target: 'netlify', netlify: { site: 'shop' }, ci: 'github', branch: 'main' },\n})\n",
    )
  })

  it('adds `deploy` to an empty config and a JSON one', () => {
    expect(
      withDeploy('kerf.config.ts', 'export default defineConfig({})\n', { target: 'vercel' }),
    ).toBe("export default defineConfig({\n  deploy: { target: 'vercel' },\n})\n")
    expect(
      JSON.parse(withDeploy('kerf.config.json', '{ "runtime": "node" }', { target: 'render' })),
    ).toEqual({ runtime: 'node', deploy: { target: 'render' } })
  })
})

describe('kerf deploy', () => {
  const which = (cmd: string) => cmd === 'netlify' || cmd === 'flyctl'

  registerDryDeploy(which)

  registerProductionDeploy(which)

  it("refuses a host that can't run the app before it builds, and names the way past", async () => {
    await expect(
      deployCommand(app(CHAT), { deploy: { target: 'vercel' } }, { yes: true, env: {} }),
    ).rejects.toThrow(/E001[\s\S]*--unsafe-allow E001/)
    await expect(deployCommand(app(), {}, {})).rejects.toMatchObject({
      code: 'E_REFUSED',
      message: expect.stringContaining('kerf suggests `netlify`'),
    })
  })

  registerCiTokenChecks(which)

  it('a server host deploys production only, one machine for the memory bus, and the URL from the app', async () => {
    const dir = app(CHAT)
    await expect(
      deployCommand(dir, { deploy: { target: 'fly', fly: { app: 'shop' } } }, { which, env: {} }),
    ).rejects.toThrow(/--prod/)
    const calls: string[][] = []
    const r = await deployCommand(
      dir,
      { deploy: { target: 'fly', fly: { app: 'shop' } } },
      {
        yes: true,
        prod: true,
        which,
        env: { FLY_API_TOKEN: 't' },
        exec: (cmd, args) => Promise.resolve((calls.push([cmd, ...args]), { code: 0, stdout: '' })),
      },
    )
    expect(calls).toEqual([['flyctl', 'deploy', '--remote-only', '--app', 'shop', '--ha=false']])
    expect(r.url).toBe('https://shop.fly.dev')
  })

  it('Render: the deploy hook, read from the environment', async () => {
    const posted: string[] = []
    const r = await deployCommand(
      app(),
      { deploy: { target: 'render', render: { service: 'shop' } } },
      {
        yes: true,
        prod: true,
        env: { RENDER_DEPLOY_HOOK_URL: 'https://api.render.com/deploy/srv-1?key=k' },
        post: (url) => Promise.resolve((posted.push(url), { ok: true })),
      },
    )
    expect(posted).toEqual(['https://api.render.com/deploy/srv-1?key=k'])
    expect(r.url).toBe('https://shop.onrender.com')
  })

  it('reads the URL each CLI prints', () => {
    expect(urlFrom({ url: 'last-line' }, 'Vercel CLI 50\nhttps://shop-abc.vercel.app\n')).toBe(
      'https://shop-abc.vercel.app',
    )
    expect(urlFrom({ url: 'workers' }, 'Uploaded shop\n  https://shop.acme.workers.dev\n')).toBe(
      'https://shop.acme.workers.dev',
    )
  })
})

function registerProductionDeploy(which: (cmd: string) => boolean) {
  it('--yes builds for the target, runs the host CLI and reports the URL', async () => {
    const calls: string[][] = []
    const r = await deployCommand(
      app(),
      { deploy: { target: 'netlify' } },
      {
        yes: true,
        prod: true,
        which,
        env: { NETLIFY_AUTH_TOKEN: 't', NETLIFY_SITE_ID: 's' },
        build: (_, o) =>
          Promise.resolve((calls.push(['build', o.preset]), { ok: true, diagnostics: [] })),
        exec: (cmd, args) =>
          Promise.resolve(
            (calls.push([cmd, ...args]),
            {
              code: 0,
              stdout:
                'Deploying…\n{ "deploy_url": "https://x--shop.netlify.app", "url": "https://shop.netlify.app" }',
            }),
          ),
      },
    )
    expect(calls).toEqual([
      ['build', 'netlify'],
      [
        'netlify',
        'deploy',
        '--dir',
        'dist',
        '--functions',
        '.netlify/functions-internal',
        '--json',
        '--prod',
      ],
    ])
    expect(r.url).toBe('https://shop.netlify.app')
  })
}

function registerDryDeploy(which: (cmd: string) => boolean) {
  it('without --yes runs nothing, and says what it would', async () => {
    let ran = false
    const r = await deployCommand(
      app(),
      { deploy: { target: 'netlify', netlify: { site: 'shop' } } },
      {
        which,
        env: {},
        build: () => {
          ran = true
        },
        exec: () => {
          ran = true
        },
      },
    )
    expect(ran).toBe(false)
    expect(r.dryRun).toBe(true)
    expect(r.steps!.map((s) => s.what)).toEqual([
      'kerf build --preset netlify',
      'netlify deploy --dir dist --functions .netlify/functions-internal --json --site shop',
    ])
    expect(r.steps![1]!.reads).toEqual(['NETLIFY_AUTH_TOKEN', 'NETLIFY_SITE_ID'])
  })
}

function registerCiTokenChecks(which: (cmd: string) => boolean) {
  it('E007 in CI: a token the CLI would otherwise take from its login', async () => {
    await expect(
      deployCommand(
        app(),
        { deploy: { target: 'netlify', netlify: { site: 's' } } },
        {
          yes: true,
          which,
          env: { CI: '1' },
          build: () => Promise.resolve({ ok: true, diagnostics: [] }),
        },
      ),
    ).rejects.toThrow(/E007: `NETLIFY_AUTH_TOKEN` is unset/)
    const local = await deployCommand(
      app(),
      { deploy: { target: 'netlify', netlify: { site: 's' } } },
      { which, env: {} },
    )
    expect(local.diagnostics.map((d) => [d.code, d.severity])).toEqual([['E007', 'warning']])
  })
}
