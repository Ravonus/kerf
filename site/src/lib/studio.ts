// The theme studio's model: a `warp()` config compiled in the browser by warp's own theme compiler, as one named
// theme ("studio"), so only the preview under [data-palette="studio"] takes it.
import {
  checkTokens,
  normalizeSeed,
  partContrast,
  seedByName,
  themeCss,
  themeOptions,
} from '@weft-js/warp/theme'
import facts from '../generated/theme-context.json'

type Value = string | number
/** What the studio edits: the same keys `warp()` takes in weft.config.ts. */
export interface StudioConfig {
  seed?: { accent?: string; neutral?: string }
  colors?: Record<string, string>
  system?: Record<string, Record<string, Value | Record<string, Value>>>
  parts?: Record<string, unknown>
  tokens?: Record<string, string>
  dials?: { theme?: string; expression?: string; density?: string; flair?: string }
}

export const STUDIO_PALETTE = 'studio'
const context = { ...facts, tokenNames: new Set(facts.tokenNames) }
/** Every `--warp-*` token the stylesheet declares, for the token picker. */
export const TOKEN_NAMES: readonly string[] = facts.tokenNames

export interface Compiled {
  css: string
  /** The first problem in the config, as the plugin would report it at build time. */
  error?: { path: string; message: string }
  /** Part text on a part fill below 4.5:1 (the build fails on these: D010). */
  contrast: string[]
}

const seedAt = (seed: unknown, path: string, colors: Record<string, string>) => {
  try {
    return normalizeSeed(seedByName(seed, colors))
  } catch (error) {
    throw Object.assign(error as Error, { path })
  }
}

/** The config as CSS for [data-palette="studio"], or the problem that stops it. */
export function compile(config: StudioConfig): Compiled {
  const { dials: _, ...theme } = config
  try {
    const o = themeOptions({ themes: { [STUDIO_PALETTE]: theme } }, context.tokenNames, {
      seed: seedAt,
      tokens: (t: Record<string, string> | undefined, p: string) => checkTokens(t, p) ?? {},
    })
    const own = o.themes[STUDIO_PALETTE]!
    return {
      css: themeCss(o, context),
      contrast: partContrast(own.rows, own.colors, ''),
    }
  } catch (e) {
    const err = e as Error & { path?: string }
    return {
      css: '',
      error: { path: err.path ?? '', message: err.message },
      contrast: [],
    }
  }
}

// -- editing -------------------------------------------------------------------------------------------------------

const plain = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** `config` with `path` set to `value`; `undefined` or '' removes it, and empty objects on the way go too. */
export function setIn(config: StudioConfig, path: readonly string[], value: unknown): StudioConfig {
  const put = (node: unknown, i: number): unknown => {
    const obj = plain(node) ? { ...node } : {}
    const key = path[i]!
    if (i === path.length - 1) {
      if (value === undefined || value === '') delete obj[key]
      else obj[key] = value
    } else {
      const next = put(obj[key], i + 1)
      if (plain(next) && !Object.keys(next).length) delete obj[key]
      else obj[key] = next
    }
    return obj
  }
  return put(config, 0) as StudioConfig
}

/** The value at `path`, or undefined. */
export function getIn(config: StudioConfig, path: readonly string[]): unknown {
  let node: unknown = config
  for (const key of path) node = plain(node) ? node[key] : undefined
  return node
}

// -- output --------------------------------------------------------------------------------------------------------

const KEY = /^[a-zA-Z_$][\w$]*$/
/** A value as TypeScript source, two-space indented, keys bare where they can be. */
function source(v: unknown, depth: number): string {
  if (!plain(v)) return typeof v === 'string' ? `'${v.replaceAll("'", "\\'")}'` : String(v)
  const pad = '  '.repeat(depth + 1)
  const rows = Object.entries(v).map(
    ([k, x]) => `${pad}${KEY.test(k) ? k : `'${k}'`}: ${source(x, depth + 1)},`,
  )
  return rows.length ? `{\n${rows.join('\n')}\n${'  '.repeat(depth)}}` : '{}'
}

/** weft.config.ts with this theme: the whole app gets it. */
export function configSource(config: StudioConfig): string {
  return [
    "import { defineConfig } from '@weft-js/start'",
    "import { warp } from '@weft-js/warp/plugin'",
    '',
    'export default defineConfig({',
    `  plugins: [warp(${source(config, 1).replace(/^\{\}$/, '')})],`,
    '})',
    '',
  ].join('\n')
}

/** As JSON, for the editor. */
export const configJson = (config: StudioConfig) => JSON.stringify(config, null, 2)
