import type { PluginInstance } from '@weft-js/core/plugin'

/** For `site.head`: restores `setDial(…, { persist: true })` before the first paint. */
export const dialScript: string

/** Every spec rule keyed on `[data-fields="classic"]`, re-scoped to the root: classic fields as the default. */
export function classicCss(): string

/** What `warp()` takes in weft.config: the seed, the default dials, radius, fonts and any token. */
export interface WarpOptions {
  /**
   * The brand's hue family: `{ accent: '#rrggbb' }` (or a name from `colors`), or a hue and chroma. Each theme solves its own lightness, and the build
   * prints where it landed. `neutral` tints pages, surfaces and text the same way. Checked at the stops `dials` leave (D010).
   */
  seed?: ({ accent: string } | { hue: number; chroma: number } | {}) & {
    neutral?: string | { hue: number; chroma: number }
  }
  /** `'classic'` makes classic fields the default. */
  fields?: 'floating' | 'classic'
  /** The app's default dials. A `data-*` on `<html>` or any scope still wins. */
  dials?: {
    expression?: 'quiet' | 'balanced' | 'vivid'
    density?: 'compact' | 'cozy' | 'comfortable'
    flair?: 'sweep' | 'none'
    theme?: 'light' | 'dark'
    /** The named theme (from `themes`) a page shows when nothing chooses one. */
    palette?: string
  }
  /** Replaces the radius each expression sets. */
  radius?: 'sharp' | 'soft' | 'round'
  /** Replaces the icon drawing each expression shows: a vivid site with balanced (line) icons is `icons: 'balanced'`. */
  icons?: 'quiet' | 'balanced' | 'vivid'
  /** A family name, or a full CSS font stack. */
  fonts?: { body?: string; display?: string; mono?: string }
  /** Any spec token, like `{ '--warp-color-page': '#fafafa' }`. Checked at the stops `dials` leave (D010). */
  tokens?: Record<`--warp-${string}`, string>
  /**
   * Named colours, like Tailwind's: `{ brand: '#e8590c' }`. Use the name anywhere a colour goes (`parts`, `tone="brand"`,
   * Tailwind's `bg-brand`). Each one also becomes a tone, solved like the accent so it reads in light and dark.
   */
  colors?: Record<string, `#${string}`>
  /** The scale every part reads: radius, space, type, shadows, motion. A number is px (ms for durations). */
  system?: WarpSystem
  /** Any part, at rest and in each state: `{ button: { radius: 'pill', bg: 'brand', hover: { bg: 'ink' } } }`. */
  parts?: WarpParts
  /** Named themes, each with the same options. `data-palette="ocean"` (or `setDial('palette', 'ocean')`) switches. */
  themes?: Record<string, WarpTheme>
}

/** One named theme: its own seed, colours, scale, parts and tokens, over the page's. */
export interface WarpTheme {
  seed?: WarpOptions['seed']
  colors?: Record<string, `#${string}`>
  system?: WarpSystem
  parts?: WarpParts
  tokens?: Record<`--warp-${string}`, string>
}

type Len = number | string
/** The handles of `cubic-bezier(x1, y1, x2, y2)`, the same shape a scroll timeline's key takes. */
export type Handles = readonly [x1: number, y1: number, x2: number, y2: number]
/** A CSS easing, or cubic-bezier handles. */
type Ease = string | Handles
type Color = string
/** Text roles warp sets type for. */
type TextRole =
  | 'body'
  | 'button'
  | 'caption'
  | 'code'
  | 'control'
  | 'display'
  | 'eyebrow'
  | 'heading'
  | 'label'
  | 'prose'
  | 'title'

/**
 * A length on a line: `min` px at the `from` width, `max` px at `to`, held outside them (a `clamp()` on `vw`). Inside a
 * breakpoint, `from` is the breakpoint.
 */
export interface Fluid {
  min: number
  max: number
  from?: number
  to: number
}
/** A value by viewport width: `base` below the first breakpoint, then one from each min-width in px. */
export type ByWidth<T> = { base?: T; [minWidth: number]: T }

/**
 * One text role's type. A number is px for `size` and `tracking`. Any property can change by width
 * (`{ base: 16, 768: 14 }`); `size` and `tracking` can also be `Fluid`: `{ base: 72, 768: { min: 120, max: 220, to: 1680 } }`.
 */
export interface TextStyle {
  size?: Len | Fluid | ByWidth<Len | Fluid>
  weight?: number | string | ByWidth<number | string>
  leading?: number | string | ByWidth<number | string>
  tracking?: Len | Fluid | ByWidth<Len | Fluid>
  case?: string | ByWidth<string>
  font?: string | ByWidth<string>
  /** The face's optical size, as `font-variation-settings: "opsz" <n>`; `'auto'` leaves it to the font size. */
  opsz?: number | 'auto' | ByWidth<number | 'auto'>
  /** Also set the first letter of any element with `data-first-letter="<role>"` (a drop cap, a script initial). */
  firstLetter?: boolean
}

/** The design system's own scales, retuned app-wide: `system.radius.control`, `system.space.related`, `system.text.button`. */
export interface WarpSystem {
  radius?: { control?: Len; surface?: Len; mark?: Len; round?: Len }
  space?: { hair?: Len; tight?: Len; related?: Len; group?: Len; section?: Len; page?: Len }
  pad?: { control?: Len; surface?: Len }
  control?: { sm?: Len; md?: Len; lg?: Len }
  font?: { sans?: string; display?: string; mono?: string }
  /** warp's roles, and any role the app names (`narrative`): each becomes `--warp-text-<role>-*` and `data-role="<role>"`. */
  text?: { [R in TextRole]?: TextStyle } & Record<string, TextStyle>
  shadow?: { 0?: string; 1?: string; 2?: string; 3?: string; sm?: string; md?: string; lg?: string }
  /** warp's steps, and any the app names (`glide: 300`): `--warp-duration-<name>`, exact, ms for a number. */
  duration?: { instant?: Len; fast?: Len; base?: Len; slow?: Len } & Record<string, Len>
  /** warp's curves, and any the app names: `--warp-ease-<name>`, a CSS easing or cubic-bezier handles. */
  ease?: { [E in 'in' | 'out' | 'in-out' | 'pop' | 'spring' | 'sheet']?: Ease } & Record<
    string,
    Ease
  >
  border?: { hairline?: Len; emphasis?: Len }
  icon?: { sm?: Len; md?: Len; stroke?: number | string }
}

/** Properties every part takes. Colours are names from `colors` or CSS colours; lengths are px or names. */
export interface PartProps {
  bg?: Color
  text?: Color
  border?: Color
  borderWidth?: Len
  radius?: number | 'control' | 'surface' | 'mark' | 'round' | 'pill' | 'none' | (string & {})
  padding?: Len
  paddingX?: Len
  paddingY?: Len
  gap?: Len
  margin?: Len
  height?: Len
  minHeight?: Len
  width?: Len
  size?: Len
  shadow?: 'none' | 'sm' | 'md' | 'lg' | 0 | 1 | 2 | 3 | (string & {})
  opacity?: number
  scale?: number
  /** ms for a number; a name from `system.duration` reads its token. */
  duration?: Len
  /** A name from `system.ease`, a CSS easing, or cubic-bezier handles. */
  easing?: Ease
  font?: 'sans' | 'display' | 'mono' | (string & {})
  fontSize?: Len
  weight?: number | string
  leading?: number | string
  tracking?: Len
  case?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
}
type State = 'hover' | 'focus' | 'press' | 'active' | 'open' | 'disabled'
/** A part's look at rest, then per state. */
export type PartStyle<P = PartProps, S extends string = State> = P & { [K in S]?: P }
type Underline = { color?: Color; width?: Len; offset?: Len; duration?: Len }
type Emphasis = 'soft' | 'outline' | 'ghost' | 'frame' | 'link'

/** Every element `warp({ parts })` can restyle, at rest and per state: `parts.button.hover.bg`, `parts.nav.underline`. */
export interface WarpParts {
  button?: PartStyle & { [E in Emphasis]?: PartStyle }
  iconButton?: PartStyle<PartProps & { icon?: Len }>
  copy?: PartStyle
  close?: PartStyle
  link?: PartStyle & { underline?: PartStyle<Underline, 'hover' | 'focus'> }
  nav?: PartProps & { item?: PartStyle; underline?: Underline }
  tabs?: PartProps & { tab?: PartStyle; underline?: Underline }
  pill?: PartStyle
  badge?: PartStyle
  chip?: PartStyle
  card?: PartStyle
  field?: PartStyle & { label?: PartStyle<{ text?: Color }, 'hover' | 'focus'> }
  /** The stroke that draws round a control on hover and focus, the text it lights, and its speed. */
  sweep?: { stroke?: Color; base?: Color; text?: Color; width?: Len; duration?: Len }
  dialog?: PartProps
  sheet?: PartProps
  popover?: PartProps
  toast?: PartProps
}

/** The Vite plugin that serves warp's tokens for an app. */
export const warp: (options?: WarpOptions) => PluginInstance<unknown>
/** The plugin, for `import warp from`. */
export default warp
