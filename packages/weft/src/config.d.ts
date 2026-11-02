// The weft.config.ts surface (PLAN §7b manifest, §7c reserved `plugins`/`slots`). Validated by `weft check` (P-codes).
import type { CardTheme } from './head'

/** A JSON Schema object, or anything with Zod's `~standard`/`_zod` shape (converted with `z.toJSONSchema`). */
export type ArgsSchema = Record<string, unknown>

/** A named command for `weft run`. */
export interface TaskDef {
  /** Shell command `weft run <name>` will run, from the project root. */
  run: string
  /** One line an agent reads to decide whether to run it. Missing is P004. */
  description: string
  /** What it changes outside the process: `'db'`, `'network'`, `'fs:dist/**'`… `[]` when none. Missing is P004. */
  sideEffects: readonly string[]
  /** Environments it may run in (keys of `environments`). Omitted: all. */
  env?: readonly string[]
  args?: ArgsSchema
}

/** The slots a plugin can fill. */
export type SlotId =
  | 'font.build'
  | 'text.measure'
  | 'surface.renderer'
  | 'realtime.bus'
  | 'server.extension'
  | 'db.adapter'
  | 'pay.rail'
  | `device.${string}`
  | (string & {})

/**
 * A `plugins` entry: what a `@weft-js/core/plugin` factory returns (`warp()`), or plain data `{ name, provides }`.
 * `weft check` runs a factory's pure `contribute()` and validates the rest as data (P100, P111–P117, P009).
 */
export interface PluginEntry {
  name: string
  version?: string
  /** Slots this entry provides (a factory fills this from its `contribute()`). */
  provides?: readonly (SlotId | { slot: SlotId; key: string })[]
  options?: unknown
}

/** Page metadata defaults (research 20 §2). Every page writes these as static tags in the server's first response. */
export interface SiteConfig {
  /** Response headers by route, static files included: `{ '/arena/**': { 'x-frame-options': 'DENY' } }`. */
  headers?: Record<string, Record<string, string>>
  name?: string
  /** Absolute `http(s)` origin (and base path) for canonical, og:url and relative images. Without it a relative image is H001. */
  url?: string
  /** Title template containing `%s`, which a page's title fills: `'%s · Acme'`. A page without a title gets `name`. */
  title?: string
  /** Missing is H003; over 160 characters is H004. */
  description?: string
  /** `en_US` style: og:locale and `<html lang>`. */
  locale?: string
  /** `'auto'` = the generated card (research 20 §4, not built yet), or a path/URL with its size. */
  /** A path or URL; `'auto'` (the default) is the generated card, `false` no image at all. */
  image?: false | string | { url: string; width?: number; height?: number; alt?: string }
  /** The generated card's look, over what warp and the text plugin give it. */
  card?: CardTheme
  twitter?: { card?: 'summary' | 'summary_large_image' | 'app' | 'player'; site?: string; creator?: string }
  /** `false`: no stylesheet text in the page, just links. */
  inlineCss?: boolean
  /** `false`: one sheet per chunk, inline up to 48 KB, instead of a first-paint part of the build's one sheet. */
  criticalCss?: boolean
  /** Words of selectors a first paint keeps whatever the HTML holds: for a class a head script sets. */
  criticalKeep?: string[]
  /** Raw HTML for every page's head, before the stylesheets: what has to run before the first paint. Not escaped. */
  head?: string
}

/** Everything `weft.config.ts` can say. */
export interface WeftConfig {
  /** Where agents may write, may read, and may never touch (globs from the project root). */
  scope?: { write?: readonly string[]; read?: readonly string[]; forbid?: readonly string[] }
  tasks?: Record<string, TaskDef>
  environments?: Record<string, { url?: string; [key: string]: unknown }>
  /** `include`: test files for the T-codes (default `**\/*.{test,spec}.*`). */
  test?: { include?: readonly string[]; lanes?: readonly ('fast' | 'browser' | 'e2e')[]; gate?: { mutationBudgetSec?: number; maxMutants?: number } }
  /** Files `weft check` compiles. Default `['**\/*.{tsx,jsx}']`, minus node_modules, dist, .weft and `scope.forbid`. */
  check?: {
    include?: readonly string[]
    exclude?: readonly string[]
    /** `false` turns the design D-codes (D001–D007, D011, D030–D039) off. Default on. */
    design?: boolean
    /** `false` turns the route pass off: H001–H007 and H011–H016 per route, which runs the app's loaders once. Default on. */
    routes?: boolean
    /** Prop inference (research 44). `false` turns it off; `'manual'` leaves written types to `weft fix` instead of `weft dev`. Default on. */
    props?: boolean | 'manual'
  }
  plugins?: readonly PluginEntry[]
  site?: SiteConfig
  /** Where `weft build` targets (research 28 §5). `weft dev` always runs on Node. */
  runtime?: 'node' | 'bun' | 'deno'
  /** The crates behind `remote('rust://<name>')` and `native('<name>')`. One is `crates/<name>` unless it says otherwise. */
  rust?: {
    /** Let plain object unions through to a sidecar (R102). */
    unions?: 'allow'
    services?: Record<string, {
      /** The crate, from the app's root. */
      crate?: string
      /** Built and run elsewhere: no cargo here, and `WEFT_RUST_<NAME>_URL` says where it is. */
      external?: boolean
      /** `false`: a `native()` crate that can't build for WASM, and needs no fallback on this host (R104). */
      wasm?: false
    }>
  }
  /**
   * Default `'lazy'`: code that needs no client ships none, and islands load when they're needed, with what happens
   * before then replayed (PLAN §11). `'partial'`: every island loads with the page. `'full'` hydrates every route whole.
   */
  hydration?: 'lazy' | 'partial' | 'full'
  /** `'warn'` turns the plugin lock's P109 and P110 into warnings. Default `'enforce'`. */
  /** Targets for a query's `live: { verify: 'staging' }`. */
  live?: {
    targets?: Record<string, {
      /** A running staging app. */
      url?: string
      /** The name of the env var that holds its database URL. */
      db?: string
      /** `false` is required: `verify` writes rows, and only to what you've said isn't production. */
      production?: boolean
    }>
  }
  trust?: 'enforce' | 'warn'
  /** Pick a winner when two plugins provide one slot: `{ 'text.measure': '@weft-js/text' }`. */
  slots?: { [id: string]: string | Record<string, string> }
}

/** The config, checked and returned as given. */
export declare function defineConfig<const C extends WeftConfig>(config: C): C
