import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, join, relative, resolve, sep, win32 } from 'node:path'
import { searchForWorkspaceRoot } from 'vite'
import { INLINE_CSS_MAX } from '../inline.mjs'
import { packageDirs } from './dev.mjs'
import { assetBytes } from './asset-bytes.mjs'
import { combineSheets, sheetPieces, inlineSheets } from './sheets.mjs'
import { here, V, KIT_CHUNKS, INLINE_SHEETS, SHEET_PIECES, ROUTE_ASSET_BYTES } from './shared.mjs'

export const configHook = (s) =>
  function (config, env) {
    s.root = config.root ? resolve(config.root) : s.root
    s.dev = env.command === 'serve'
    s.scan()
    return {
      environments: {
        client: {
          build: {
            rollupOptions: {
              input: s.clientEntry(),
              output: { advancedChunks: { groups: KIT_CHUNKS } },
            },
          },
        },
        ssr: { build: { rollupOptions: { input: V.server } } },
      },
      // The router-core server bundle and Takumi's addon stay external to the SSR graph; Nitro traces them.
      ssr: {
        noExternal: ['@kerf/start', '@kerf/veneer', '@kerf/veneer-icons', '@kerf/core'],
        external: ['@takumi-rs/core'],
      },
      optimizeDeps: {
        exclude: ['@kerf/start', '@kerf/veneer', '@kerf/veneer-icons', '@kerf/core'],
      }, // they ship TSX for the kerf plugin
      // The runtime files of @kerf/start, kerf and Nitro are served from wherever they're installed (a linked package
      // sits outside the app's root).
      server: {
        fs: { allow: [searchForWorkspaceRoot(s.root), join(here, '..'), ...packageDirs(s.root)] },
      },
      // One copy of the router: the app's route files and the generated entries import the same module.
      resolve: {
        alias: [
          { find: /^@kerf\/start$/, replacement: join(here, 'index.ts') },
          { find: /^@kerf\/start\/(client|server)$/, replacement: join(here, '$1.tsx') },
          { find: /^@kerf\/start\/media$/, replacement: join(here, 'media.ts') },
        ],
      },
    }
  }

function emittedReader(dir) {
  const root = realpathSync(dir)
  const inside = (path) => {
    const rel = relative(root, path)
    return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
  }
  return (file) => {
    if (
      typeof file !== 'string' ||
      !file ||
      isAbsolute(file) ||
      win32.parse(file).root ||
      file.includes('\\') ||
      file.split('/').includes('..')
    )
      throw new Error('Invalid asset path')
    const path = resolve(root, file)
    if (!inside(path)) throw new Error('Asset outside output')
    const real = realpathSync(path)
    if (!inside(real)) throw new Error('Asset outside output')
    return readFileSync(real)
  }
}

export const writeBundle = (s) => ({
  order: 'post',
  async handler(out, bundle) {
    if (!s.dev && this.environment?.config.consumer === 'client' && out.dir) {
      const name = 'kerf-route-assets.json'
      if (bundle[name]) throw new Error(`Cannot overwrite emitted ${name}`)
      const bytes = assetBytes(bundle, emittedReader(out.dir), s.manifest ?? s.scan(), s.abs)
      bytes.build = s.build || null
      writeFileSync(join(out.dir, name), JSON.stringify(bytes))
      s.routeAssetBytes = bytes
    }
    if (
      s.dev ||
      this.environment?.config.consumer !== 'client' ||
      s.options.site?.criticalCss === false ||
      s.options.site?.inlineCss === false
    )
      return
    s.sheetPlan = combineSheets(
      out.dir,
      bundle,
      s.manifest ?? s.scan(),
      s.abs,
      (await s.hydration(this))?.islands ?? [],
      s.options.site?.base ?? '/',
    )
  },
})

export const renderChunk = (s) => ({
  order: 'post',
  handler(code) {
    const receiptToken = new RegExp(`["'\`]${ROUTE_ASSET_BYTES}["'\`]`)
    const hasReceipt = receiptToken.test(code)
    if (hasReceipt) {
      let receipt = null
      try {
        const top = this.environment.getTopLevelConfig()
        const client = resolve(s.root, top.environments.client.build.outDir)
        const saved = JSON.parse(readFileSync(join(client, 'kerf-route-assets.json'), 'utf8'))
        if (s.build && saved.build === s.build) receipt = saved
      } catch {
        /* no matching client receipt */
      }
      code = code.replace(receiptToken, () => JSON.stringify(receipt))
    }
    const token = new RegExp(`["'\`]${INLINE_SHEETS}["'\`]`)
    if (!token.test(code)) return hasReceipt ? { code, map: null } : null
    const top = this.environment.getTopLevelConfig()
    const client = resolve(s.root, top.environments.client.build.outDir)
    code = code.replace(new RegExp(`["'\`]${SHEET_PIECES}["'\`]`), () =>
      JSON.stringify(
        s.sheetPlan &&
          sheetPieces(client, top.base ?? '/', s.sheetPlan, s.options.site?.criticalKeep, s.root),
      ),
    )
    // With a first-paint table the server reads none of these; without, a page too big to carry whole is split (`pageStyles`).
    const sheets =
      s.options.site?.inlineCss === false
        ? {}
        : inlineSheets(
            client,
            top.base ?? '/',
            s.options.site?.criticalCss === false ? Infinity : INLINE_CSS_MAX,
          )
    return { code: code.replace(token, () => JSON.stringify(sheets)), map: null }
  },
})

export const configResolved = (s) =>
  function (config) {
    // Each build is its own version, unless it's pinned: instances built apart that serve one deploy, or a
    // reproducible build (SOURCE_DATE_EPOCH), have to agree on it.
    s.build =
      process.env.KERF_BUILD_ID ||
      createHash('sha256')
        .update(process.env.SOURCE_DATE_EPOCH || String(Date.now()))
        .digest('hex')
        .slice(0, 8)
    if (s.dev) s.build = 'dev'
    s.root = config.root
    const main = config.plugins.find((p) => p.name === 'kerf')
    s.words = config.plugins.find((p) => p.name === 'kerf:purge')?.api
    s.words?.add('data-kerf styled') // gate.css reveals a mark a static page's HTML may hold alone
    if (main?.api) {
      s.compile = createRequire(join(here, 'vite.mjs'))('@kerf/core/compiler').transform
      main.api.islands = async (ctx, file) =>
        (await s.hydration(ctx))?.files.get(file.replace(/\?.*$/, ''))
    }
  }
