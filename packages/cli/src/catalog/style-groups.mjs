/** styleGroups diagnostic entries in catalog order. */
export const styleGroups = [
  // Style groups (research 23 §3). D010 is warp's contrast gate (its own plugin); D040 and D081 are reserved by warp's docs.
  {
    code: 'D020',
    severity: 'warning',
    by: 'cli',
    catches:
      'Class soup: a static `class`/`className` with more than 8 classes, or the same class list (4+ classes) in two or more places',
    fix: "Extract a style group (`group('order-card', …)`, name suggested from the component) and spread it; `weft style find` first, one may already fit",
  },
  {
    code: 'D021',
    severity: 'warning',
    by: 'cli',
    catches:
      'Two style groups resolve to 90% or more of the same CSS (`similar` in .weft/styles.json)',
    fix: 'Merge them into one group with an axis for what differs',
  },
  {
    code: 'D022',
    severity: 'info',
    by: 'cli',
    catches: 'The same accent (`accent: { … }` at a call site) on one group at 3 or more sites',
    fix: 'Promote it to an axis value and pass that value at those sites',
  },
  {
    code: 'D023',
    severity: 'warning',
    by: 'cli',
    catches: 'A `css: { … }` escape (raw CSS) in a style group',
    fix: 'Use the token the fix names; keep the escape only where no intent sets the property',
  },
  {
    code: 'D024',
    severity: 'error',
    by: 'compiler',
    catches:
      "Styles that fight with no order: two group roots spread on one element; two compounds that can match at once and set one property differently, or an accent that sets what the site's own axis value sets (`weft check`)",
    fix: 'One group per element (nest an element, or make it an axis); exclusive compound `when`s; drop the accent or make it an axis value',
    example:
      "import { group } from '@weft-js/core/style'\nconst a = group('a', { base: { pad: 'group' } })\nconst b = group('b', { base: { gap: 'related' } })\nexport function X() { return <li {...a()} {...b()} /> }",
  },
  {
    code: 'D025',
    severity: 'error',
    by: 'compiler',
    catches:
      "Unknown name in a style group: an axis value, axis, state or part a call site uses that the group doesn't have, or an intent or token that isn't in the vocabulary (also a type error)",
    fix: 'Use one of the names listed (the closest come first); `weft style explain <group>` shows them all',
    example:
      "import { group } from '@weft-js/core/style'\nconst card = group('card', { axes: { status: { open: {}, late: {} } } })\nexport function X() { return <article {...card({ status: 'lost' })} /> }",
  },
]
