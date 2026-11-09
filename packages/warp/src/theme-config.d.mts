/** The dials supported by both configuration forms. */
export interface WarpDials {
  expression?: 'quiet' | 'balanced' | 'vivid'
  density?: 'compact' | 'cozy' | 'comfortable'
  flair?: 'sweep' | 'none'
  theme?: 'light' | 'dark'
}

/** The non-colour Button properties currently bound by the themed stylesheet. */
export interface ButtonLayout {
  gap?: number | string
  paddingInline?: number | string
  borderWidth?: number | string
  radius?: number | string
  shadow?: string
  duration?: number | string
  hover?: ButtonState
  press?: ButtonState & { scale?: number }
  font?: {
    family?: string
    size?: number | string
    weight?: number
    letterSpacing?: number | string
  }
}

/** Bound state properties for Button geometry and typography. */
export type ButtonState = Pick<
  ButtonLayout,
  'gap' | 'paddingInline' | 'borderWidth' | 'radius' | 'font' | 'shadow'
>
/** Bound Tabs trigger dimensions and typography. */
export type TabsState = {
  height?: number | string
  paddingInline?: number | string
  radius?: number | string
  font?: { family?: string; size?: number | string; weight?: number }
}
/** Bound Link geometry and typography. */
export type LinkState = { radius?: number | string; font?: { weight?: number } }
/** Bound Pill dimensions, typography and timing. */
export type PillState = {
  gap?: number | string
  height?: number | string
  paddingInline?: number | string
  borderWidth?: number | string
  radius?: number | string
  duration?: number | string
  font?: { family?: string; size?: number | string; weight?: number; lineHeight?: number }
}
/** Bound sweep geometry and timing. */
export type SweepState = { width?: number | string; duration?: number | string }

/** Options shared by the base and named-palette configurations. */
export interface WarpCommonOptions {
  /** Inherited space, radius and font scale inputs. */
  system?: {
    space?: Record<string, number | string>
    radius?: Record<string, number | string>
    font?: Record<string, string>
    text?: {
      display?: {
        family?: string
        size?: number | string
        weight?: number
        lineHeight?: number
        letterSpacing?: number | string
      }
      title?: {
        family?: string
        size?: number | string
        weight?: number
        lineHeight?: number
        letterSpacing?: number | string
      }
      heading?: {
        family?: string
        size?: number | string
        weight?: number
        lineHeight?: number
        letterSpacing?: number | string
      }
      body?: { family?: string; size?: number | string; weight?: number; lineHeight?: number }
      caption?: { size?: number | string; lineHeight?: number }
      code?: { family?: string; size?: number | string; lineHeight?: number }
      label?: {
        family?: string
        size?: number | string
        weight?: number
        lineHeight?: number
        letterSpacing?: number | string
        transform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
      }
      button?: {
        family?: string
        size?: number | string
        weight?: number
        lineHeight?: number
        letterSpacing?: number | string
        transform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
      }
    }
    shadow?: { none?: string; sm?: string; md?: string; lg?: string }
    motion?: {
      duration?: { spring?: number | string; sweep?: number | string; frame?: number | string }
    }
  }
  /** Named hex colours or aliases to other named colours. */
  colors?: Record<string, string>
  /** 'classic' makes classic fields the default. */
  fields?: 'floating' | 'classic'
  /** Replaces the radius each expression sets. */
  radius?: 'sharp' | 'soft' | 'round'
  /** A family name, or a full CSS font stack. */
  fonts?: { body?: string; display?: string; mono?: string }
}
