/** Generated finite part overrides. */
export interface ThemeParts1 {
  button?: {
    bg?: string
    text?: string
    border?: string | { color?: string; width?: number | string; style?: string }
    highlight?: string
    gap?: number | string
    height?: number | string
    paddingInline?: number | string
    radius?: number | string
    font?:
      | string
      | {
          family?: string
          size?: number | string
          weight?: number | string
          letterSpacing?: number | string
          transform?: string
        }
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
    gap?: number | string
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
    gap?: number | string
    height?: number | string
    paddingInline?: number | string
    radius?: number | string
    font?:
      | string
      | {
          css?: string
        }
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
    radius?: number | string
    font?:
      | string
      | {
          family?: string
          size?: number | string
          letterSpacing?: number | string
          transform?: string
        }
  }
  field?: {
    label?: string
    bg?: string
    gap?: number | string
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
  'text/display'?: {
    font?:
      | string
      | {
          family?: string
          size?: number | string
          lineHeight?: number | string
          weight?: number | string
          letterSpacing?: number | string
        }
  }
  'text/title'?: {
    font?:
      | string
      | {
          family?: string
          size?: number | string
          lineHeight?: number | string
          weight?: number | string
          letterSpacing?: number | string
        }
  }
  'text/heading'?: {
    font?:
      | string
      | {
          family?: string
          size?: number | string
          lineHeight?: number | string
          weight?: number | string
          letterSpacing?: number | string
        }
  }
}
