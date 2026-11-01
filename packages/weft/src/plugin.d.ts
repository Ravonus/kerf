// weft/plugin: the whole plugin authoring surface (research 13 §2.3, minimal Phase 2 slice).

export type Side = 'build' | 'client' | 'worker' | 'server' | 'native'
type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

export interface SlotDef<Id extends string = string, Impl = unknown, V extends number = number> {
  readonly id: Id
  readonly version: V
  readonly cardinality: 'one' | 'keyed'
  readonly sides: readonly Side[]
  /** A built-in provider name used when nobody provides one, or `null`. */
  readonly default: string | readonly string[] | null
  /** Phantom: carries the interface type. */
  readonly __impl?: Impl
}

/** Where an implementation lives. Loaded lazily through the generated `weft:slot/<id>` module. */
export interface ModuleRef {
  module: string
  export: string
  options?: Json
}

export interface ProviderRef<Impl = unknown> {
  readonly slot: SlotDef<string, Impl>
  readonly versions: readonly number[]
  readonly key?: string
  readonly sides: Partial<Record<Side, ModuleRef>>
}

export interface Permissions {
  fs?: { read?: string[]; write?: string[] }
  net?: string[]
  env?: string[]
  spawn?: string[]
  native?: boolean
}

export interface PluginEnv {
  command: 'check' | 'dev' | 'build' | 'test'
  mode: string
  root: string
}

export interface Contributions {
  provides?: ProviderRef[]
  requires?: SlotDef[]
  /** CSS variables in `--<namespace>-*`; `css` is written to `.weft/tokens/<namespace>.css`. Collisions are P113. */
  tokens?: {
    namespace: string
    css?: string
    values?: Record<string, unknown>
    /** Module ids the build resolves to another id, written to `.weft/tokens/<namespace>.alias.json`: one variant compiled in. */
    alias?: Record<string, string>
  }
  /** One AGENTS.md section, at most 1 KB (P112). */
  agents?: { title: string; text: string }
  /** The generated share card's defaults (`site.card`): colours and faces, under whatever the config sets. */
  card?: import('./head').CardTheme
  /** Components/APIs for the MCP catalog. Names collide across plugins as P113. */
  catalog?: { name: string; import: string; summary: string }[]
  /** Codes in the plugin's namespace (P111 otherwise). */
  diagnostics?: { code: string; catches: string; fix: string; severity?: 'error' | 'warning' }[]
  /** Runs in `weft check`, never on HMR: it reads through `ctx` and returns findings in the plugin's namespace. */
  check?: { include?: string[]; run(ctx: CheckContext): Finding[] | Promise<Finding[]> }
  /** `weft docs <topic>`: a page in the package, read at the time. `weft docs <code>` finds `diagnostics` by itself. */
  docs?: { topic: string; summary: string; file: string }
  /** What `weft add <alias>` does after adding the plugin. See {@link Setup}. */
  setup?: Setup
  /** Lines `weft add` prints after installing. */
  notes?: string[]
}

export interface CheckContext {
  root: string
  /** The files that match `include`, relative to the root. */
  files: readonly string[]
  read(rel: string): string
  exists(rel: string): boolean
  bytes(rel: string): Uint8Array | undefined
  jsx(rel: string): unknown
  importOf(scan: unknown, name: string): unknown
  /** The config's slot bindings. */
  slots: Readonly<Record<string, unknown>>
}

export interface Finding {
  code: string
  file: string
  start?: number
  end?: number
  why: string
  help?: string
  severity?: 'error' | 'warning' | 'info'
  fix?: { description: string; safe?: boolean; edits: { file?: string; start: number; end: number; text: string }[] }
}

/** Files a plugin writes into an app, for `weft add`. Pure: it describes, and `weft add` does the writing, or a dry run. */
export interface Setup {
  /** Other packages to add first, as `weft add` would. */
  with?: string[]
  /** What the app must have, each with what to run instead: `'db'` and `'auth'`. */
  needs?: ('db' | 'auth')[]
  run(app: { engine: string | null; layer: string | null; read(rel: string): string | undefined }): {
    /** New files. One that exists stops `weft add`, with nothing changed. */
    files?: Record<string, string>
    /** Existing files, whole. */
    edits?: Record<string, string>
    /** Lines for `.env` and `.env.example`, kept out of git and in it. Placeholders only. */
    env?: Record<string, string>
    next?: string[]
  }
}

/** Options: a Standard Schema (Zod 4, Valibot…) or a parse function that throws on bad input. */
export type OptionsSchema<I, O> =
  | { readonly '~standard': { validate(value: unknown): { value: O; issues?: undefined } | { issues: readonly { message: string; path?: readonly unknown[] }[] } }; readonly '~types'?: { input: I; output: O } }
  | ((input: I) => O)

export interface PluginDef<I, O> {
  /** Package name (P116). */
  name: string
  version: string
  /** Semver range on weft (P103). */
  weft?: string
  /** Diagnostic namespace: first-party plugins claim a letter (`'D'`); the default is `<short-name>/`. */
  namespace?: string
  options?: OptionsSchema<I, O>
  permissions?: Permissions
  /**
   * Pure, runs once per load and must return the same manifest every time (P117). Throw an error carrying `code`
   * (one of your `diagnostics`) to fail the build with that diagnostic, e.g. a seed whose text can't pass contrast.
   */
  contribute(options: O, env: Readonly<PluginEnv>): Contributions
}

/** A `plugins: []` entry: plain data, plus the non-enumerable plugin hooks `weft` calls. */
export interface PluginInstance<O = unknown> {
  readonly name: string
  readonly version: string
  readonly provides: readonly (string | { slot: string; key: string })[]
  readonly options: O
  readonly weft: string
  readonly namespace: string
  readonly permissions: Readonly<Permissions>
  contribute(env: PluginEnv): Readonly<Contributions>
}

export declare function defineSlot<const Id extends string, const V extends number, Impl = unknown>(
  slot: Omit<SlotDef<Id, Impl, V>, '__impl' | 'default'> & { default?: SlotDef['default'] },
): SlotDef<Id, Impl, V>
export declare function provide<Impl>(slot: SlotDef<string, Impl>, provider: Omit<ProviderRef<Impl>, 'slot' | 'versions'> & { versions?: readonly number[] }): ProviderRef<Impl>
/** Invalid options throw an error with `code: 'P115'` and `path`. */
export declare function definePlugin<I = void, O = I>(def: PluginDef<I, O>): (options?: I) => PluginInstance<O>
