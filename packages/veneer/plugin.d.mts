import type { PluginInstance } from '@kerf/core/plugin'

/** For `site.head`: restores `setDial(…, { persist: true })` before the first paint. */
export const dialScript: string

/** Every spec rule keyed on `[data-fields="classic"]`, re-scoped to the root: classic fields as the default. */
export function classicCss(): string

/** What `veneer()` takes in kerf.config: the seed, the default dials, radius, fonts and any token. */
export interface VeneerOptions {
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
  /** Any spec token, like `{ '--veneer-color-page': '#fafafa' }`. Checked at the stops `dials` leave (D010). */
  tokens?: Record<`--veneer-${string}`, string>
  /**
   * Named colours, like Tailwind's: `{ brand: '#e8590c' }`. Use the name anywhere a colour goes (`parts`, `tone="brand"`,
   * Tailwind's `bg-brand`). Each one also becomes a tone, solved like the accent so it reads in light and dark.
   */
  colors?: Record<string, `#${string}`>
  /** The scale every part reads: radius, space, type, shadows, motion. A number is px (ms for durations). */
  system?: VeneerSystem
  /** Any part, at rest and in each state: `{ button: { radius: 'pill', bg: 'brand', hover: { bg: 'ink' } } }`. */
  parts?: VeneerParts
  /** Named themes, each with the same options. `data-palette="ocean"` (or `setDial('palette', 'ocean')`) switches. */
  themes?: Record<string, VeneerTheme>
}

/** One named theme: its own seed, colours, scale, parts and tokens, over the page's. */
export interface VeneerTheme {
  seed?: VeneerOptions['seed']
  colors?: Record<string, `#${string}`>
  system?: VeneerSystem
  parts?: VeneerParts
  tokens?: Record<`--veneer-${string}`, string>
}

type Len = number | string
type Color = string
/** Text roles veneer sets type for. */
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

/** The design system's own scales, retuned app-wide: `system.radius.control`, `system.space.related`, `system.text.button`. */
export interface VeneerSystem {
  radius?: { control?: Len; surface?: Len; mark?: Len; round?: Len }
  space?: { hair?: Len; tight?: Len; related?: Len; group?: Len; section?: Len; page?: Len }
  pad?: { control?: Len; surface?: Len }
  control?: { sm?: Len; md?: Len; lg?: Len }
  font?: { sans?: string; display?: string; mono?: string }
  text?: Partial<
    Record<
      TextRole,
      {
        size?: Len
        weight?: number | string
        leading?: number | string
        tracking?: Len
        case?: string
        font?: string
      }
    >
  >
  shadow?: { 0?: string; 1?: string; 2?: string; 3?: string; sm?: string; md?: string; lg?: string }
  duration?: { instant?: Len; fast?: Len; base?: Len; slow?: Len }
  ease?: {
    in?: string
    out?: string
    'in-out'?: string
    pop?: string
    spring?: string
    sheet?: string
  }
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
  duration?: Len
  easing?: string
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

/** Every element `veneer({ parts })` can restyle, at rest and per state: `parts.button.hover.bg`, `parts.nav.underline`. */
export interface VeneerParts {
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

/** The Vite plugin that serves veneer's tokens for an app. */
export const veneer: (options?: VeneerOptions) => PluginInstance<unknown>
/** The plugin, for `import veneer from`. */
export default veneer
