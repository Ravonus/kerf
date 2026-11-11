import type { Plugin } from 'vite'

/** A slot as a recipe writes it. `from` inherits another slot's fields under its own. */
export interface GenSlot {
  /** `make` (text to image), `over` (repaint a guide), `control` (follow depth or line), `animate`, `loop`. */
  readonly op?: 'make' | 'over' | 'control' | 'animate' | 'loop'
  /** Guide passes, space-separated: `id:<name>`, `depth`, `normal`, `line`, `block`, `light`. */
  readonly on?: string
  /** The intent, at most 25 words. The prompt around it comes from the style and the operation. */
  readonly says?: string
  /** Bases, space-separated: `params`, `palette:N`, `field:WxH[xC]`, `residual:WxH`, `tile:S[+pbr]`, `stamps:N@S`, `curves:N`, `sparse:WxH`, `flow:WxH`, `flip:F@S`. */
  readonly out?: string
  /** Generator parameters to fit: `<module>.<group>`. */
  readonly fit?: string
  /** Candidates per call, 1..4. Default 1. */
  readonly n?: number
  /** The most calls this slot may make in a run, retries included. Default 1. */
  readonly calls?: number
  /** Default the style's seed. */
  readonly seed?: number
  /** The adapter id this slot needs; a run with another adapter leaves it alone. */
  readonly via?: string
  /** Pixels, like `1536x1024`. A call that returns another size fails. */
  readonly size?: string
  /** A slot of this recipe, a library slot of the style, or `file#slot` in another recipe beside this one. */
  readonly from?: string
  /** Handed to the adapter, and part of the request's digest. The mock reads `simulate`. */
  readonly params?: Readonly<Record<string, unknown>>
}

/** The style bible (`keel-style@1`), shared by a project's recipes. */
export interface GenStyle {
  readonly style: 'keel-style@1'
  readonly seed: number
  readonly manner: string
  /** The negative prompt. */
  readonly avoid: string
  readonly light: string
  /** Name → `#rrggbb`. */
  readonly palette: Readonly<Record<string, string>>
  /** Shared slots, named by `from`. */
  readonly lib?: Readonly<Record<string, GenSlot>>
  readonly via?: string
}

/** A recipe file (`keel-gen@1`). `style` is relative to the recipe. */
export interface GenRecipe {
  readonly gen: 'keel-gen@1'
  readonly style: string
  readonly guide?: string
  readonly slots: Readonly<Record<string, GenSlot>>
}

/** A slot with its parent's fields and the defaults filled in. */
export interface ResolvedSlot extends GenSlot {
  readonly name: string
  readonly op: NonNullable<GenSlot['op']>
  readonly on: string
  readonly says: string
  readonly out: string
  readonly n: number
  readonly calls: number
  readonly seed: number
}

/** One problem a check found. */
export interface GenProblem {
  /** The JSON path, like `slots["plate.sky"].out`. */
  readonly path: string
  readonly message: string
}

/** What `checkStyle` and `checkRecipe` found: every problem at once. */
export interface GenCheck {
  readonly ok: boolean
  readonly problems: readonly GenProblem[]
}

/** One basis an `out` string asks for: `tile:128+pbr` is `{ kind: 'tile', args: [128], pbr: true }`. */
export interface GenOut {
  readonly kind: string
  readonly args: readonly number[]
  readonly pbr?: true
}

/** Checks a style bible: every problem at once, each with its path. */
export declare function checkStyle(style: unknown): GenCheck

/** Checks a recipe, its style and a deny list (whole words, any case): every problem at once, each with its path. */
export declare function checkRecipe(
  recipe: unknown,
  options?: {
    readonly style?: unknown
    readonly deny?: readonly string[]
    /** Gives another recipe's slot for a `file#slot` reference; without it such a reference is a problem. */
    readonly resolveFrom?: (ref: string) => GenSlot | undefined
  },
): GenCheck

/** The recipe's slots, defaulted, in dependency order. Throws with every problem when it does not check. */
export declare function resolveSlots(
  recipe: GenRecipe,
  style: GenStyle,
  options?: {
    readonly deny?: readonly string[]
    readonly resolveFrom?: (ref: string) => GenSlot | undefined
  },
): ResolvedSlot[]

/** The bases an `out` string asks for; `undefined` for a word that is not a basis kind. */
export declare function parseOut(out: string): (GenOut | undefined)[]

/** The prompt and negative prompt a slot sends. Deterministic. */
export declare function buildPrompt(
  style: GenStyle,
  slot: ResolvedSlot,
): { prompt: string; negative: string }

/** Canonical JSON: sorted keys, no whitespace. */
export declare function canonical(value: unknown): string
/** sha256 as hex. */
export declare function sha256(data: string | Uint8Array): string
/** A request's digest, over the fields that decide its output. */
export declare function requestDigest(request: GenRequest): string

/** A guide or other input. `digest` is its recipe digest when it has one; otherwise its bytes' digest is used. */
export interface GenInput {
  readonly role: string
  readonly path?: string
  readonly bytes?: Uint8Array
  readonly digest?: string
}

/** What a slot asks an adapter for. */
export interface GenRequest {
  readonly adapter: string
  readonly model: string
  readonly op: string
  readonly prompt: string
  readonly negative?: string
  readonly seed?: number
  readonly size?: string
  readonly n: number
  readonly params?: Readonly<Record<string, unknown>>
  readonly inputs: readonly (GenInput & { readonly digest: string })[]
}

/** Seat tokens a call reported. */
export interface GenTokens {
  readonly input: number
  readonly output: number
}

/** What an adapter's call gave back. */
export interface GenResult {
  /** PNG bytes. */
  readonly outputs: Uint8Array[]
  readonly mime: 'image/png'
  readonly model?: string
  readonly tokens?: GenTokens
  readonly durationMs: number
  readonly requestId?: string
}

/** What a call is expected to use, for the plan and the seat guard. */
export interface GenEstimate {
  readonly calls: number
  readonly wallMs: number
  readonly seatTokens: number
}

/** A model adapter. */
export interface GenAdapter {
  readonly id: string
  readonly model: string
  capabilities(): { ops: readonly string[]; maxInputs: number; seed: boolean }
  estimate(request: GenRequest): GenEstimate
  run(request: GenRequest, options?: { signal?: AbortSignal }): Promise<GenResult>
  /** A vision model's reading of images, for a critic. */
  critique?(
    ask: { prompt: string; images: readonly string[]; modelId?: string },
    options?: { signal?: AbortSignal },
  ): Promise<{ text: string; tokens: GenTokens }>
}

/** The deterministic adapter for tests and CI. `params.simulate`: `refusal`, `timeout`, `429` or `wrong-size`. */
export declare function createMockAdapter(): GenAdapter

/** The adapter for a loopback bridge (default `http://127.0.0.1:8795`); bytes inputs go under `<cacheDir>/inputs/`. */
export declare function createBridgeAdapter(options: {
  base?: string
  cacheDir: string
}): GenAdapter

/** A PNG (8-bit gray, gray and alpha, RGB, RGBA; not interlaced) as RGBA rows. */
export declare function decodePng(bytes: Uint8Array): {
  width: number
  height: number
  rgba: Uint8Array
}

/** A guard refused an input or a prompt; nothing was sent. */
export declare class GenRefused extends Error {
  readonly input: string | undefined
  constructor(message: string, input?: string)
}

/** A model call failed. */
export declare class GenFailure extends Error {
  readonly outcome: 'refused' | 'timeout' | 'rate-limited' | 'wrong-size' | 'failed'
  constructor(outcome: GenFailure['outcome'], message: string)
}

/** A guard over reference folders: `check` throws a `GenRefused` for a path inside one, or bytes equal to a file there. */
export declare function referenceGuard(roots?: readonly string[]): {
  check(input: { path?: string | undefined; bytes?: Uint8Array | undefined }): void
}

/** A candidate output: its raw file in the cache and its bytes. */
export interface GenCandidate {
  readonly path: string
  readonly bytes: Uint8Array
}

/** A distilled basis: the `.kmx` bytes and what they hold. */
export interface GenBasis {
  readonly bytes: Uint8Array
  readonly kind: string
  readonly dims: unknown
  readonly params?: unknown
}

/** One slot in the dry run. */
export interface GenPlanRow {
  readonly slot: string
  readonly adapter: string
  readonly op: string
  readonly n: number
  readonly state: 'locked' | 'cached' | 'miss'
  readonly calls: number
  readonly wallMs: number
  readonly seatTokens: number
}

/** The guides a slot is made over: KEEL renders, as paths or bytes, with their recipe digests. */
export type GenGuides = (slot: {
  slot: ResolvedSlot
  name: string
}) => readonly GenInput[] | Promise<readonly GenInput[]>

/** The dry run: each slot's state and what its call would use. Writes and calls nothing. */
export declare function planGen(options: {
  readonly recipeFile: string
  readonly cacheDir?: string
  readonly adapter?: GenAdapter
  readonly deny?: readonly string[]
  /** Without it a slot's guides count as none, so a guided slot shows as a miss. */
  readonly guides?: GenGuides
}): Promise<{ rows: GenPlanRow[]; totals: GenEstimate }>

/** Options for `runGen`. */
export interface GenRunOptions {
  readonly recipeFile: string
  readonly adapter: GenAdapter
  /** Turns the chosen candidate into a basis; the distillers live outside weft. */
  readonly distil: (input: {
    slot: ResolvedSlot
    out: (GenOut | undefined)[]
    candidates: readonly GenCandidate[]
    chosen: number
    guides: readonly GenInput[]
  }) => GenBasis | Promise<GenBasis>
  /** Picks among several candidates. `critique` (when the adapter has one) is guarded and counted; `tokens` are what it spent otherwise. */
  readonly critic?: (input: {
    slot: ResolvedSlot
    candidates: readonly GenCandidate[]
    guides: readonly GenInput[]
    critique: GenAdapter['critique']
  }) => Promise<{ pick: number; scores?: unknown; tokens?: GenTokens }>
  readonly guides?: GenGuides
  /** Folders no input may come from, by path or by bytes. */
  readonly reference?: readonly string[]
  readonly deny?: readonly string[]
  /** The most calls the run may make. */
  readonly maxCalls: number
  /** The most wall time the run may take, checked against each call's estimate before it starts. */
  readonly maxWallMs: number
  /** Slots to make again even though they are locked. */
  readonly reroll?: readonly string[]
  /** Default `<cwd>/.weft/cache/gen`. */
  readonly cacheDir?: string
  readonly log?: (line: string) => void
}

/** What a run did with one slot. */
export interface GenSlotResult {
  readonly slot: string
  readonly state: 'locked' | 'cached' | 'made' | 'failed' | 'stopped' | 'skipped'
  readonly request?: string
  readonly candidate?: number
  /** The basis file, relative to the lock. */
  readonly basis?: string
  readonly error?: string
  readonly reason?: string
  readonly stopped?: string
}

/** Runs a recipe's slots through an adapter to bases and the lock, within the seat caps. */
export declare function runGen(options: GenRunOptions): Promise<{
  calls: number
  tokens: GenTokens
  stopped?: { reason: string; slot: string }
  slots: GenSlotResult[]
}>

/** The Vite plugin for `import plate from './plate.gen.json?gen'`. It never calls a model. */
export declare function keelGen(options?: {
  /** Where `gen run` keeps raw outputs, for `?gen&bake=<slot>`. Default `<root>/.weft/cache/gen`. */
  readonly cacheDir?: string
}): Plugin
