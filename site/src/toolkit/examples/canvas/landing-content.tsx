export const LAND_WRAP =
  'padding-inline:clamp(16px,5cqi,56px);max-inline-size:1120px;margin-inline:auto'

export const LAND_SECTION = `${LAND_WRAP};padding-block:clamp(40px,8cqi,88px)`

// The site's own h1-h3 rule outranks the stage's layered defaults, so the headings name the stage's resolved face.
export const DISPLAY =
  'margin:0;line-height:0.95;font-family:var(--stage-type-face);font-weight:var(--stage-type-heft);letter-spacing:var(--stage-type-track)'

export const LEDE =
  'margin:0;font-size:clamp(16px,2cqi,19px);line-height:1.5;max-inline-size:52ch;padding:10px 12px;border-radius:6px'

export const H2 = `${DISPLAY};font-size:clamp(32px,5cqi,52px)`

export const LAND_FEATURES = [
  {
    kind: 'weave',
    title: 'Previews on every push',
    body: 'Each branch gets its own URL in about forty seconds, torn down when it merges.',
  },
  {
    kind: 'flow',
    title: 'Rollbacks in one press',
    body: 'Every deploy is kept. Go back to any of them without a rebuild.',
  },
  {
    kind: 'drift',
    title: 'Edge cache, tuned',
    body: 'Static work is cached near your readers, and purged the moment you ship.',
  },
] as const

export const LAND_PLANS = [
  { name: 'Hobby', monthly: 0, blurb: 'One project, previews, a shared build queue.' },
  { name: 'Team', monthly: 24, blurb: 'Unlimited projects, rollbacks, five seats.' },
  { name: 'Scale', monthly: 89, blurb: 'Edge cache, audit log, priority builds.' },
] as const

export const LAND_FAQ = [
  {
    q: 'Is any of this really a canvas?',
    a: 'Every border, fill, shadow, field, check and heading you see is painted on one canvas. The DOM underneath keeps the layout, the text, focus and the accessibility tree.',
  },
  {
    q: 'Does it have to be dithered?',
    a: 'No. Dithering is one look. A look is a set of painters, so the same page can be flat vector, pencil, neon or anything a 2D context can draw. Switch looks above.',
  },
  {
    q: 'What happens on a phone?',
    a: 'The page reflows like any other: the grids stack, the hero wraps, and the stage paints wherever the boxes land.',
  },
  {
    q: 'And with reduced motion?',
    a: 'Backgrounds hold still, pieces appear without their entrance, and every state still shows.',
  },
]

