// Theme schema digest: 76b5e0def0bfee0b6848e3d4604cf29be82e13a0b39bab0ac49a767d0019aae6
import type { PluginInstance } from '@weft-js/core/plugin'

import type { ThemeParts1 } from './src/theme-parts-1.mjs'
import type { ThemeParts2 } from './src/theme-parts-2.mjs'
import type { ThemeParts3 } from './src/theme-parts-3.mjs'
import type { ThemeParts4 } from './src/theme-parts-4.mjs'
import type { ThemeParts5 } from './src/theme-parts-5.mjs'
import type { ThemeParts6 } from './src/theme-parts-6.mjs'
/** Explicit overrides; canonical sheet bindings remain under classification. */
export type ThemeParts = ThemeParts1 &
  ThemeParts2 &
  ThemeParts3 &
  ThemeParts4 &
  ThemeParts5 &
  ThemeParts6

/** A system density stop. */
export interface ThemeDensity {
  factor?: number
  control?: { sm?: number | string; md?: number | string; lg?: number | string }
}
/** A custom text role. */
export interface ThemeTextRole {
  family?: string
  size?: number | string
  lineHeight?: number | string
  weight?: number | string
  letterSpacing?: number | string
  transform?: string
}
/** System scale types; bindings remain under classification. */
export interface ThemeSystem {
  space?: Record<string, number | string>
  radius?: Record<string, number | string>
  font?: Record<string, string>
  shadow?: Record<string, string>
  border?: { hairline?: number | string; emphasis?: number | string }
  padding?: { control?: number | string; surface?: number | string }
  control?: { sm?: number | string; md?: number | string; lg?: number | string }
  field?: { height?: number | string }
  layout?: {
    bar?: number | string
    tabbar?: number | string
    rail?: number | string
    sidebar?: number | string
    list?: number | string
    aside?: number | string
    measure?: number | string
    narrow?: number | string
    content?: number | string
    wide?: number | string
  }
  focus?: { width?: number | string; offset?: number | string; color?: string }
  density?: { compact?: ThemeDensity; cozy?: ThemeDensity; comfortable?: ThemeDensity }
  motion?: {
    scale?: number
    press?: number
    stagger?: number | string
    staggerMax?: number
    distance?: number | string
    scaleFrom?: number
    duration?: {
      arrive?: number | string
      base?: number | string
      'exit-k'?: number | string
      fast?: number | string
      fill?: number | string
      frame?: number | string
      instant?: number | string
      'label-char'?: number | string
      'label-float'?: number | string
      message?: number | string
      push?: number | string
      route?: number | string
      sheet?: number | string
      slow?: number | string
      spring?: number | string
      sweep?: number | string
    }
    easing?: {
      in?: string
      'in-out'?: string
      'label-float'?: string
      out?: string
      pop?: string
      sheet?: string
      spring?: string
      sweep?: string
      'sweep-in'?: string
    }
  }
  color?: {
    'accent-border'?: string
    'accent-on-solid'?: string
    'accent-soft'?: string
    'accent-solid'?: string
    'accent-solid-hover'?: string
    'accent-text'?: string
    border?: string
    'border-control'?: string
    'border-strong'?: string
    'caution-border'?: string
    'caution-on-solid'?: string
    'caution-soft'?: string
    'caution-solid'?: string
    'caution-solid-hover'?: string
    'caution-text'?: string
    'critical-border'?: string
    'critical-on-solid'?: string
    'critical-soft'?: string
    'critical-solid'?: string
    'critical-solid-hover'?: string
    'critical-text'?: string
    'data-1'?: string
    'data-2'?: string
    'data-3'?: string
    'data-4'?: string
    'data-5'?: string
    'data-6'?: string
    'data-7'?: string
    'data-8'?: string
    'data-axis'?: string
    'data-div-mid'?: string
    'data-div-neg'?: string
    'data-div-pos'?: string
    'data-down'?: string
    'data-down-flash'?: string
    'data-grid'?: string
    'data-other'?: string
    'data-seq-0'?: string
    'data-seq-1'?: string
    'data-seq-2'?: string
    'data-seq-3'?: string
    'data-seq-4'?: string
    'data-seq-5'?: string
    'data-up'?: string
    'data-up-flash'?: string
    field?: string
    'field-active'?: string
    'field-invalid'?: string
    focus?: string
    'highlight-border'?: string
    'highlight-on-solid'?: string
    'highlight-soft'?: string
    'highlight-solid'?: string
    'highlight-solid-hover'?: string
    'highlight-text'?: string
    'info-border'?: string
    'info-on-solid'?: string
    'info-soft'?: string
    'info-solid'?: string
    'info-solid-hover'?: string
    'info-text'?: string
    label?: string
    'label-active'?: string
    'label-rest'?: string
    'neutral-border'?: string
    'neutral-on-solid'?: string
    'neutral-soft'?: string
    'neutral-solid'?: string
    'neutral-solid-hover'?: string
    'neutral-text'?: string
    'on-inverse'?: string
    page?: string
    'positive-border'?: string
    'positive-on-solid'?: string
    'positive-soft'?: string
    'positive-solid'?: string
    'positive-solid-hover'?: string
    'positive-text'?: string
    'primary-on-solid'?: string
    'primary-solid'?: string
    'primary-solid-hover'?: string
    scrim?: string
    surface?: string
    'surface-active'?: string
    'surface-hover'?: string
    'surface-inverse'?: string
    'surface-line'?: string
    'surface-overlay'?: string
    'surface-raised'?: string
    'surface-sunken'?: string
    sweep?: string
    'sweep-base'?: string
    'sweep-critical'?: string
    text?: string
    'text-faint'?: string
    'text-subtle'?: string
  }
  text?: Record<string, ThemeTextRole | undefined> & {
    display?: {
      family?: string
      size?: number | string
      lineHeight?: number | string
      weight?: number | string
      letterSpacing?: number | string
    }
    title?: {
      family?: string
      size?: number | string
      lineHeight?: number | string
      weight?: number | string
      letterSpacing?: number | string
    }
    heading?: {
      family?: string
      size?: number | string
      lineHeight?: number | string
      weight?: number | string
      letterSpacing?: number | string
    }
    body?: { family?: string; size?: number | string; lineHeight?: number | string }
    label?: {
      family?: string
      size?: number | string
      lineHeight?: number | string
      weight?: number | string
      letterSpacing?: number | string
      transform?: string
    }
    caption?: { family?: string; size?: number | string; lineHeight?: number | string }
    eyebrow?: {
      family?: string
      size?: number | string
      lineHeight?: number | string
      weight?: number | string
      letterSpacing?: number | string
      transform?: string
    }
    code?: { family?: string; size?: number | string }
  }
}

/** For `site.head`: restores `setDial(…, { persist: true })` before the first paint. */
export const dialScript: string

/** What `warp()` takes in weft.config: the seed, the default dials, radius, fonts and any token. */
export interface WarpOptions {
  /** System overrides are not yet supported; an empty dictionary is accepted. */
  system?: Record<string, never>
  /** Named hex colours or aliases to other named colours. */
  colors?: Record<string, string>
  /** Named palettes may replace configured named hex colours. */
  themes?: Record<string, { colors?: Record<string, string> }>
  /** Resting Button colours are supported together; empty dictionaries are accepted. */
  parts?: { button?: { bg?: never; text?: never } | { bg: string; text: string } }
  /**
   * The brand's hue family: `{ accent: '#rrggbb' }`, or a hue and chroma. Each theme solves its own lightness, and the build
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
    /** Default named palette; auto restores the base palette. */
    palette?: string
    theme?: 'light' | 'dark'
  }
  /** Replaces the radius each expression sets. */
  radius?: 'sharp' | 'soft' | 'round'
  /** A family name, or a full CSS font stack. */
  fonts?: { body?: string; display?: string; mono?: string }
  /** Any spec token, like `{ '--warp-color-page': '#fafafa' }`. Checked at the stops `dials` leave (D010). */
  tokens?: Record<`--warp-${string}`, string>
}

/** The Vite plugin that serves warp's tokens for an app. */
export const warp: (options?: WarpOptions) => PluginInstance<unknown>
/** The plugin, for `import warp from`. */
export default warp
