import { Grid, Stack, Row, StageSelect, DitherStage, CanvasStage } from '@weft-js/warp'
import { untrack } from '@weft-js/core'
import type { LookName } from './paint-primitives'
import { LOOKS } from './looks'

// Every built-in skin on one stage; the same markup takes whichever look paints it.
export function Skins(props: { group: string }) {
  return (
    <Grid min="md" cols={2} gap="group">
      <Stack gap="related" data-skin="card">
        <Row gap="related" wrap>
          <button data-skin="button">Deploy</button>
          <button data-skin="button" data-look="outline">
            Preview
          </button>
          <button data-skin="button" disabled>
            Paused
          </button>
        </Row>
        <label data-part="label">
          Project
          <input data-skin="field" value="storefront" />
        </label>
        <label data-part="label">
          Region
          <StageSelect options={['eu-west', 'us-east']} />
        </label>
      </Stack>
      {skinControls(() => props.group)}
    </Grid>
  )
}

function skinControls(group: () => string) {
  return (
    <Stack gap="related" data-skin="card">
      <label data-part="option">
        <input type="checkbox" data-skin="check" checked />
        Preview every push
      </label>
      <Row gap="group">
        <label data-part="option">
          <input type="radio" name={group()} data-skin="check" checked />
          Node
        </label>
        <label data-part="option">
          <input type="radio" name={group()} data-skin="check" />
          Bun
        </label>
      </Row>
      <label data-part="option">
        <input type="checkbox" role="switch" data-skin="switch" checked />
        Deploy on push
      </label>
      <label data-part="label">
        Build minutes
        <input type="range" data-skin="range" value="60" />
      </label>
      <Row gap="tight" wrap>
        <button data-skin="chip" aria-pressed="true">
          Live
        </button>
        <button data-skin="chip" aria-pressed="false">
          Building
        </button>
      </Row>
    </Stack>
  )
}

export const lookStyle = (name: LookName, rest = '') =>
  `${rest};--stage-on-fill:${LOOKS[name].style.onFill}`

// A select the stage draws, list and all. Its list floats in the top layer as a stage of its own, in the look it opened
// from, so it is never clipped and nothing under it shows through.
export const Choose = () => (
  <div data-skin="card" style="display:grid;gap:14px;inline-size:min(340px, 100%)">
    <label data-part="label">
      Region
      <StageSelect name="region" options={['eu-west', 'us-east', 'ap-south', 'sa-east']} />
    </label>
    <label data-part="label">
      Plan
      <StageSelect
        name="plan"
        value="team"
        options={[
          { value: 'hobby', label: 'Hobby' },
          { value: 'team', label: 'Team' },
          { value: 'scale', label: 'Scale (talk to us)', disabled: true },
        ]}
      />
    </label>
  </div>
)

// The landing page: everything you see is painted by the stage, in whichever look, and it still reflows, scrolls,
// focuses and reads as HTML. The look switch remounts the same markup under a different set of painters.
export type Look = 'dither' | LookName

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

export const jump = (e: MouseEvent, to?: string) => {
  e.preventDefault()
  const page = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-layout="scroll"]'),
    target = to ? page?.querySelector<HTMLElement>(`[data-land="${to}"]`) : undefined
  page?.scrollTo({ top: target ? target.offsetTop - 64 : 0, behavior: 'smooth' })
}

// One stage in the chosen look: `role` says which of the page's three stages it is. The look is fixed for its life.
export function LookStage({
  look,
  role,
  children,
  ...rest
}: {
  look: Look
  role: 'page' | 'header' | 'modal'
  children?: unknown
  [attr: string]: unknown
}) {
  const name = untrack(() => look),
    part = untrack(() => role)
  if (name === 'dither') return ditherStage(part, () => children, rest)
  const kit = LOOKS[name],
    page = lookStyle(name, 'block-size:720px'),
    plain = lookStyle(name)
  if (part === 'page')
    return (
      <CanvasStage
        {...rest}
        {...kit.stage}
        layout="scroll"
        rail
        animate={name === 'neon'}
        style={page}
      >
        {children}
      </CanvasStage>
    )
  if (part === 'header')
    return (
      <CanvasStage {...rest} {...kit.stage} background={kit.plain} style={plain}>
        {children}
      </CanvasStage>
    )
  return (
    <CanvasStage {...rest} {...kit.stage} layout="page" veil background={kit.veil} style={plain}>
      {children}
    </CanvasStage>
  )
}

function ditherStage(
  part: 'page' | 'header' | 'modal',
  children: () => unknown,
  rest: Record<string, unknown>,
) {
  if (part === 'page')
    return (
      <DitherStage
        {...rest}
        layout="scroll"
        rail
        kind="weave"
        ground={0.42}
        drift={0.4}
        style="block-size:720px"
      >
        {children()}
      </DitherStage>
    )
  if (part === 'header')
    return (
      <DitherStage {...rest} ground={0} style="background:var(--warp-color-surface)">
        {children()}
      </DitherStage>
    )
  return (
    <DitherStage {...rest} layout="page" veil={0.5} ground={0}>
      {children()}
    </DitherStage>
  )
}
