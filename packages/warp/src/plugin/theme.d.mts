/** The stylesheet facts the compiler reads: warp's layer order, scope roots, token names and accent formulas. */
export interface ThemeContext {
  layers: string[]
  scopes: string
  tokenNames: Set<string>
  formulas: Record<string, string>
  stops?: Record<string, string>
}

/** One configured property on one part, in one state. */
export interface PartRow {
  part: string
  prop: string
  state: string | null
  value: string
}

/** A named theme after checking: its seed, colours, tokens and part rows. */
export interface CheckedTheme {
  seed?: { hue: number; chroma: number; neutral?: { hue: number; chroma: number } }
  colors: Record<string, string>
  system: Record<string, string>
  rows: PartRow[]
}

/** `colors`, `system`, `parts` and `themes` after checking, ready for themeCss(). */
export interface ThemeOptions {
  colors?: Record<string, string>
  system: Record<string, string>
  rows: PartRow[]
  themes: Record<string, CheckedTheme>
  default?: string
  /** The app's own text roles (not warp's), each with the properties it sets. */
  roles?: Record<string, Set<string>>
}

/** Checks `colors`, `system`, `parts` and `themes`; throws an Error with `path` on the first bad value. */
export function themeOptions(
  input: Record<string, unknown>,
  tokenNames: Set<string>,
  check: {
    seed: (seed: unknown, path: string, colors: Record<string, string>) => unknown
    tokens: (tokens: Record<string, string> | undefined, path: string) => Record<string, string>
  },
): ThemeOptions

/** The CSS for checked options. */
export function themeCss(options: ThemeOptions, context: Omit<ThemeContext, 'tokenNames'>): string

/** Part text on a part fill below 4.5:1, as messages. */
export function partContrast(
  rows: PartRow[],
  colors: Record<string, string>,
  scope: string,
): string[]

/** `tokens` checked: `--warp-*` names with CSS values. Throws with `path`. */
export function checkTokens(
  tokens: Record<string, string> | undefined,
  path: string,
): Record<string, string> | undefined

/** A seed as `{ hue, chroma, neutral? }`; throws on a value out of range. */
export function normalizeSeed(seed: unknown): {
  hue: number
  chroma: number
  neutral?: { hue: number; chroma: number }
}

/** A seed with colour names swapped for the colours they name. */
export function seedByName(seed: unknown, colors?: Record<string, unknown>): unknown

/** The parts table; `@weft-js/warp/theme-parts` has it typed. */
export const PARTS: Record<string, unknown>
/** Tailwind v4 `@theme` names for the configured colours. */
export function tailwindTheme(options: Record<string, unknown>): string
/** A colour's tone channels, solved as warp solves its accent. */
export function toneChannels(hex: string, formulas: Record<string, string>): string
