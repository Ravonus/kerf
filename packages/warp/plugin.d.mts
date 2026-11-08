// Theme schema digest: 146674af052f9ef9811757867582267c7ccc28fd26c8ddddb14436286ccb7ba7
import type { PluginInstance } from '@weft-js/core/plugin'

/** For `site.head`: restores `setDial(…, { persist: true })` before the first paint. */
export const dialScript: string

/** Explicit overrides; canonical sheet bindings remain under classification. */
export interface ThemeParts {
  button?: {
    bg?: string
    text?: string
    border?: string | { color?: string; width?: number | string; style?: string }
    highlight?: string
    hover?: {
      bg?: string
      text?: string
      border?: string | { color?: string; width?: number | string; style?: string }
      highlight?: string
    }
    focus?: {
      bg?: string
      text?: string
      border?: string | { color?: string; width?: number | string; style?: string }
      highlight?: string
    }
    press?: {
      bg?: string
      text?: string
      border?: string | { color?: string; width?: number | string; style?: string }
      highlight?: string
    }
    disabled?: {
      bg?: string
      text?: string
      border?: string | { color?: string; width?: number | string; style?: string }
      highlight?: string
    }
  }
  sweep?: {
    stroke?: string
    base?: string
    label?: string
    text?: string
    invalid?: {
      stroke?: string
      label?: string
      text?: string
    }
  }
  nav?: {
    text?: string
    underline?: string | { color?: string; width?: number | string; offset?: number | string }
    hover?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    focus?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    active?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    disabled?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
  }
  tabs?: {
    text?: string
    underline?: string | { color?: string; width?: number | string; offset?: number | string }
    hover?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    focus?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    active?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    disabled?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
  }
  link?: {
    text?: string
    underline?: string | { color?: string; width?: number | string; offset?: number | string }
    hover?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    focus?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    press?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    disabled?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
  }
  pill?: {
    bg?: string
    text?: string
    border?: string | { color?: string; width?: number | string; style?: string }
    hover?: {
      bg?: string
      text?: string
      border?: string | { color?: string; width?: number | string; style?: string }
    }
    focus?: {
      bg?: string
      text?: string
      border?: string | { color?: string; width?: number | string; style?: string }
    }
    active?: {
      bg?: string
      text?: string
      border?: string | { color?: string; width?: number | string; style?: string }
    }
    disabled?: {
      bg?: string
      text?: string
      border?: string | { color?: string; width?: number | string; style?: string }
    }
  }
  badge?: {
    bg?: string
    text?: string
    border?: string | { color?: string; width?: number | string; style?: string }

  }
  field?: {
    label?: string
    bg?: string
    floated?: {
      label?: string
    }
    hover?: {
      label?: string
      bg?: string
    }
    focus?: {
      label?: string
      bg?: string
      ring?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    invalid?: {
      label?: string
      bg?: string
      ring?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    disabled?: {
      label?: string
      bg?: string
    }
    readonly?: {
      label?: string
      bg?: string
    }
  }
  focus?: {
    ring?: string | { color?: string; width?: number | string; offset?: number | string }

  }
  'text/display'?: { font?: {
      family?: string
      size?: number | string
      lineHeight?: number | string
      weight?: number | string
      letterSpacing?: number | string
    } }
  'text/title'?: { font?: {
      family?: string
      size?: number | string
      lineHeight?: number | string
      weight?: number | string
      letterSpacing?: number | string
    } }
  'text/heading'?: { font?: {
      family?: string
      size?: number | string
      lineHeight?: number | string
      weight?: number | string
      letterSpacing?: number | string
    } }
  'text/body'?: { font?: {
      family?: string
      size?: number | string
      lineHeight?: number | string
    } }
  'text/label'?: { font?: {
      family?: string
      size?: number | string
      lineHeight?: number | string
      weight?: number | string
      letterSpacing?: number | string
      transform?: string
    } }
  'text/caption'?: { font?: {
      family?: string
      size?: number | string
      lineHeight?: number | string
    } }
  'text/eyebrow'?: { font?: {
      family?: string
      size?: number | string
      lineHeight?: number | string
      weight?: number | string
      letterSpacing?: number | string
      transform?: string
    } }
  'text/code'?: { font?: {
      family?: string
      size?: number | string
    } }
  'status-light'?: { font?: { size?: number | string } }
}

/** The classified system scales; other scales remain under classification. */
export interface ThemeSystem {
  space?: Record<string, number | string>
  text?: Record<string, { family?: string; size?: number | string; lineHeight?: number | string; weight?: number | string; letterSpacing?: number | string; transform?: string } | undefined> & {
    display?: { family?: string; size?: number | string; lineHeight?: number | string; weight?: number | string; letterSpacing?: number | string }
    title?: { family?: string; size?: number | string; lineHeight?: number | string; weight?: number | string; letterSpacing?: number | string }
    heading?: { family?: string; size?: number | string; lineHeight?: number | string; weight?: number | string; letterSpacing?: number | string }
    body?: { family?: string; size?: number | string; lineHeight?: number | string }
    label?: { family?: string; size?: number | string; lineHeight?: number | string; weight?: number | string; letterSpacing?: number | string; transform?: string }
    caption?: { family?: string; size?: number | string; lineHeight?: number | string }
    eyebrow?: { family?: string; size?: number | string; lineHeight?: number | string; weight?: number | string; letterSpacing?: number | string; transform?: string }
    code?: { family?: string; size?: number | string }
  }
}

/** What `warp()` takes in weft.config: the seed, the default dials, radius, fonts and any token. */
export interface WarpOptions {
  /** Type and space scales from the classified shim consumers. */
  system?: ThemeSystem
  /** Part overrides from the explicit theme table. */
  parts?: ThemeParts
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
