import { expect, test } from 'vitest'
import type { WarpOptions } from '../plugin.mjs'

const options: WarpOptions = {
  colors: { ink: '#ffffff', brand: 'ink' },
  system: { space: { page: 24 }, text: { code: { family: 'mono', size: 14 } } },
  parts: {
    'text/code': { font: { family: 'mono', size: 14 } },
    'status-light': { font: { size: 14 } },
  },
}
void options

const invalid: WarpOptions = {
  parts: {
    'text/code': {
      font: {
        // @ts-expect-error Code has no font weight consumer in the type shim.
        weight: 500,
      },
    },
  },
}
void invalid

const invalidStatus: WarpOptions = {
  parts: {
    'status-light': {
      font: {
        // @ts-expect-error Status light only has an inventoried font size consumer.
        weight: 500,
      },
    },
  },
}
void invalidStatus

test('keeps the classified type role options', () => {
  const font = options.parts?.['text/code']?.font
  expect(typeof font === 'object' && font?.size).toBe(14)
})

const scales: WarpOptions = {
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

const wrongScale: WarpOptions = {
  system: {
    padding: {
      // @ts-expect-error Padding has only control and surface keys.
      unrelated: 4,
    },
  },
}
void wrongScale

const wrongColor: WarpOptions = {
  system: {
    color: {
      // @ts-expect-error System colour keys come from declared CSS tokens.
      nonexistent: '#fff',
    },
  },
}
void wrongColor

const wrongDomain: WarpOptions = {
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

const buttonGeometry: WarpOptions = {
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
