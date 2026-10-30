// The weft.config.ts surface (PLAN §7b manifest, §7c reserved `plugins`/`slots`). Validated by `weft check` (P-codes).

/** A JSON Schema object, or anything with Zod's `~standard`/`_zod` shape (converted with `z.toJSONSchema`). */
export type ArgsSchema = Record<string, unknown>

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

export type SlotId =
  | 'font.build'
  | 'text.measure'
  | 'surface.renderer'
  | 'realtime.bus'
  | 'db.adapter'
  | 'pay.rail'
  | `device.${string}`
  | (string & {})

/**
 * A `plugins` entry: what a `weft/plugin` factory returns (`warp()`), or plain data `{ name, provides }`.
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
  image?: 'auto' | string | { url: string; width?: number; height?: number; alt?: string }
  twitter?: { card?: 'summary' | 'summary_large_image' | 'app' | 'player'; site?: string; creator?: string }
}

export interface WeftConfig {
  /** Where agents may write, may read, and may never touch (globs from the project root). */
  scope?: { write?: readonly string[]; read?: readonly string[]; forbid?: readonly string[] }
  tasks?: Record<string, TaskDef>
  environments?: Record<string, { url?: string; [key: string]: unknown }>
  /** `include`: test files for the T-codes (default `**\/*.{test,spec}.*`). */
  test?: { include?: readonly string[]; lanes?: readonly ('fast' | 'browser' | 'e2e')[]; gate?: { mutationBudgetSec?: number; maxMutants?: number } }
  /** Files `weft check` compiles. Default `['**\/*.{tsx,jsx}']`, minus node_modules, dist, .weft and `scope.forbid`. */
  check?: { include?: readonly string[]; exclude?: readonly string[] }
  plugins?: readonly PluginEntry[]
  site?: SiteConfig
  /** Where `weft build` targets (research 28 §5). `weft dev` always runs on Node. */
  runtime?: 'node' | 'bun' | 'deno'
  /** `'warn'` turns the plugin lock's P109 and P110 into warnings. Default `'enforce'`. */
  trust?: 'enforce' | 'warn'
  /** Pick a winner when two plugins provide one slot: `{ 'text.measure': '@weft/plugin-text' }`. */
  slots?: { [id: string]: string | Record<string, string> }
}

export declare function defineConfig<const C extends WeftConfig>(config: C): C
