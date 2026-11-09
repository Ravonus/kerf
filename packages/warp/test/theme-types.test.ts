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

const unsupportedTheme: WarpOptions = {
  themes: {
    // @ts-expect-error Named themes are not supported yet.
    ocean: {},
  },
}
void unsupportedTheme

const unsupportedSystem: WarpOptions = {
  system: {
    // @ts-expect-error Nonempty system overrides are not supported.
    space: { group: 2 },
  },
}
const unsupportedPart: WarpOptions = {
  parts: {
    // @ts-expect-error Only Button is supported.
    link: {},
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
