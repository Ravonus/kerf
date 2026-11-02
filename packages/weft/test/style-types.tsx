// Type tests for @weft-js/core/style (`npx tsc --noEmit -p test/style-types.tsconfig.json`): each @ts-expect-error is a raw
// value, an unknown key or an unknown axis value that must not compile.
import { group } from '../src/style'

export const card = group('order-card', {
  base: { surface: 'raised', pad: 'group', radius: 'surface', gap: 'related' },
  axes: {
    status: { open: { tone: 'info' }, shipped: { tone: 'positive' }, late: { tone: 'critical' } },
    density: 'inherit',
  },
  parts: { title: { text: 'title' }, meta: { text: 'caption', emphasis: 'subtle' }, name: { text: 'label' } },
  states: { selected: { ring: 'accent' }, hover: { surface: 'sunken' } },
  compounds: [{ when: { status: 'late' }, part: 'meta', set: { ink: 'tone' } }],
  defaults: { status: 'open' },
})

card({ status: 'late', selected: true })
card()
const title: { 'data-part': string } = card.title
const name: { 'data-part': string } = card.name // a part may be called `name`
void title
void name

// @ts-expect-error raw value
group('a', { base: { pad: '13px' } })
// @ts-expect-error unknown intent key
group('b', { base: { padding: 'group' } })
// @ts-expect-error unknown key next to a known one, in an axis value
group('c', { axes: { s: { x: { tone: 'info', margin: 'group' } } } })
// @ts-expect-error unknown tone
group('d', { axes: { s: { x: { tone: 'danger' } } } })
// @ts-expect-error default isn't a value of the axis
group('e', { axes: { s: { x: { tone: 'info' } } }, defaults: { s: 'y' } })
// @ts-expect-error compound names a part that doesn't exist
group('f', { parts: { p: {} }, compounds: [{ when: {}, part: 'q', set: {} }] })
// the escape is allowed
group('g', { base: { css: { 'grid-template-columns': '1fr auto' } } })

// @ts-expect-error unknown axis value at a call site
card({ status: 'lost' })
// @ts-expect-error inherited axes aren't set at call sites
card({ density: 'compact' })
// @ts-expect-error pseudo states aren't passed
card({ hover: true })
// @ts-expect-error unknown part
void card.footer

// accents: tokens only, at a call site
card({ status: 'late', accent: { radius: 'round', pad: 'tight' } })
// @ts-expect-error an accent's token is checked
card({ accent: { radius: 'roundish' } })
// @ts-expect-error an accent has no css escape
card({ accent: { css: { color: 'red' } } })
