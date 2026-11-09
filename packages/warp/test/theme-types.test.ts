import { expect, test } from 'vitest'
import type { ThemeParts, ThemeSystem, WarpOptions } from '../plugin.mjs'

const options: WarpOptions = {
  colors: { ink: '#ffffff', brand: 'ink' },
  themes: {},
  system: {},
  parts: { button: { bg: '#757575', text: 'ink' } },
}
const empty: WarpOptions = { system: {}, themes: {}, parts: { button: {} } }
const emptyParts: WarpOptions = { parts: {} }
void options
void empty
void emptyParts

const schemaParts: ThemeParts = {
  'text/code': { font: { family: 'mono', size: 14 } },
  'status-light': { font: { size: 14 } },
}

const invalid: ThemeParts = {
  'text/code': {
    font: {
      // @ts-expect-error Code has no font weight consumer in the type shim.
      weight: 500,
    },
  },
}
void invalid

const invalidStatus: ThemeParts = {
  'status-light': {
    font: {
      // @ts-expect-error Status light only has an inventoried font size consumer.
      weight: 500,
    },
  },
}
void invalidStatus

test('keeps the classified type role options', () => {
  const font = schemaParts['text/code']?.font
  expect(typeof font === 'object' && font?.size).toBe(14)
})

const scales: { system: ThemeSystem; parts: ThemeParts } = {
  system: {
    radius: { card: 8, badge: 'var(--my-radius)' },
    font: { body: 'Inter', editorial: 'serif' },
    shadow: { sm: '0 1px 2px black' },
    border: { hairline: 1 },
    focus: { width: 2, color: '#ffffff' },
    padding: { control: 8 },
    control: { sm: 28 },
    field: { height: '2rem' },
    density: { cozy: { factor: 1, control: { md: 36 } } },
    layout: { content: 1160 },
    motion: { scale: 1, duration: { fill: 400 }, easing: { out: 'ease-out' } },
    color: { 'accent-text': '#ffffff' },
  },
  parts: { link: { underline: { color: '#ffffff', width: 2, offset: '0.2em' } } },
}
void scales

const wrongScale: { system: ThemeSystem } = {
  system: {
    padding: {
      // @ts-expect-error Padding has only control and surface keys.
      unrelated: 4,
    },
  },
}
void wrongScale

const wrongColor: { system: ThemeSystem } = {
  system: {
    color: {
      // @ts-expect-error System colour keys come from declared CSS tokens.
      nonexistent: '#fff',
    },
  },
}
void wrongColor

const wrongDomain: { system: ThemeSystem } = {
  system: {
    font: {
      // @ts-expect-error Font families are strings rather than numbers.
      body: 12,
    },
  },
}
void wrongDomain

const wrongPart: WarpOptions = {
  parts: {
    // @ts-expect-error Part names are finite.
    imaginary: {},
  },
}
void wrongPart

const buttonGeometry: { parts: ThemeParts } = {
  parts: {
    button: {
      radius: 6,
      paddingInline: '1rem',
      gap: 2,
      font: { family: 'Inter', size: 14 },
    },
  },
}
void buttonGeometry

const invalidButton: WarpOptions = {
  parts: {
    button: {
      // @ts-expect-error Button uses press, not pressed.
      pressed: { bg: '#fff' },
    },
  },
}
void invalidButton

const wrongNamedColor: WarpOptions = {
  colors: {
    // @ts-expect-error Named colours must be strings.
    brand: 42,
  },
}
void wrongNamedColor

const namedThemes: WarpOptions = {
  colors: { brand: '#ffffff' },
  themes: { ocean: { colors: { brand: '#112233' } }, sunset: {} },
  dials: { palette: 'ocean' },
}
void namedThemes

const unsupportedTheme: WarpOptions = {
  themes: {
    ocean: {
      // @ts-expect-error Named theme seeds are not supported yet.
      seed: { hue: 120, chroma: 0.1 },
    },
  },
}
void unsupportedTheme

const unsupportedSystem: WarpOptions = {
  system: {
    // @ts-expect-error Other motion settings are not yet supported.
    motion: { scale: 2 },
  },
}
const unsupportedPart: WarpOptions = {
  parts: {
    // @ts-expect-error Badge non-colour overrides are not yet supported.
    badge: { gap: 2 },
  },
}
const unsupportedHover: WarpOptions = {
  parts: {
    button: {
      bg: '#757575',
      text: '#ffffff',
      // @ts-expect-error Button states are not supported.
      hover: { bg: '#000000' },
    },
  },
}
const unsupportedBorder: WarpOptions = {
  parts: {
    button: {
      bg: '#757575',
      text: '#ffffff',
      // @ts-expect-error Button border is not supported.
      border: '#ffffff',
    },
  },
}
// @ts-expect-error Nonempty Button config requires both colours.
const missingText: WarpOptions = { parts: { button: { bg: '#757575' } } }
// @ts-expect-error Nonempty Button config requires both colours.
const missingBg: WarpOptions = { parts: { button: { text: '#ffffff' } } }
void unsupportedSystem
void unsupportedPart
void unsupportedHover
void unsupportedBorder
void missingText
void missingBg

const paletteEmptyOverrides: WarpOptions = {
  themes: { ocean: {} },
  seed: {},
  tokens: {},
  parts: {},
  dials: { palette: 'auto' },
}
const ordinarySeedAndButton: WarpOptions = {
  themes: {},
  seed: { hue: 152, chroma: 0.1 },
  tokens: { '--warp-example': 'red' },
  parts: { button: { bg: '#000000', text: '#ffffff' } },
}
void paletteEmptyOverrides
void ordinarySeedAndButton

// @ts-expect-error Named palettes cannot be combined with a root Button override.
const paletteWithButton: WarpOptions = {
  themes: { ocean: {} },
  parts: { button: { bg: '#000000', text: '#ffffff' } },
}
const paletteWithSeed: WarpOptions = { themes: { ocean: {} }, seed: { hue: 120, chroma: 0.1 } }
// @ts-expect-error Named palettes cannot be combined with root token overrides.
const paletteWithTokens: WarpOptions = {
  themes: { ocean: {} },
  tokens: { '--warp-example': 'red' },
}
const paletteDialWithSeed: WarpOptions = {
  dials: { palette: 'auto' },
  seed: { hue: 120, chroma: 0.1 },
}
void paletteWithButton
void paletteWithSeed
void paletteWithTokens
void paletteDialWithSeed

const boundLayout: WarpOptions = {
  system: {
    text: { body: { family: 'Inter', size: 17, lineHeight: 1.4 } },
    shadow: { sm: 'none' },
    motion: { duration: { sweep: 450 } },
  },
  parts: { button: { gap: 'group', radius: 8, font: { size: 14, weight: 600 } } },
}
void boundLayout
const unknownTextRole: WarpOptions = {
  system: {
    text: {
      // @ts-expect-error Unbound text roles are not supported.
      unknown: { size: 12 },
    },
  },
}
void unknownTextRole

const mappedParts: WarpOptions = {
  parts: {
    button: { shadow: 'sm', duration: 100, hover: { shadow: 'none' }, press: { scale: 0.8 } },
    nav: { gap: 4, underline: { width: 2 } },
    tabs: { gap: 4, underline: { width: 2 } },
    link: { underline: { width: 2, offset: 3 } },
    pill: { gap: 4, font: { lineHeight: 1.2 }, hover: { gap: 6 }, active: { gap: 8 } },
    field: { gap: 4, radius: 8 },
    card: { padding: 8, shadow: 'sm', hover: { shadow: 'none' } },
  },
}
void mappedParts
const unsupportedCardState: WarpOptions = {
  parts: {
    card: {
      // @ts-expect-error Card press has no mapped reader.
      press: { shadow: 'none' },
    },
  },
}
void unsupportedCardState

const extendedReaders: WarpOptions = {
  parts: {
    sweep: { width: 2, hover: { duration: 100 }, press: { width: 3 }, active: { duration: 140 } },
    button: { hover: { gap: 10, font: { size: 19 } }, press: { radius: 4 } },
    nav: { paddingBlock: 8, duration: 100, active: { gap: 12 } },
    tabs: { height: 40, hover: { font: { family: 'Inter' } }, active: { paddingInline: 12 } },
    link: { duration: 100, press: { font: { weight: 700 } } },
    pill: { active: { height: 40, font: { lineHeight: 1.2 } } },
    field: { height: 62, paddingInline: 20, hover: { shadow: 'none' } },
    card: { hover: { padding: 24, radius: 12 } },
  },
}
void extendedReaders
const unboundSweep: WarpOptions = {
  parts: {
    sweep: {
      // @ts-expect-error Sweep border width is not a mapped property.
      borderWidth: 2,
    },
  },
}
void unboundSweep
