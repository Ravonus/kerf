import {
  Grid,
  Stack,
  Row,
  StageSelect,
  DitherStage,
  CanvasStage,
} from '@kerf/veneer'
import { untrack } from '@kerf/core'
import type { LookName } from './paint-primitives'
import { LOOKS } from './looks'

// Every built-in skin on one stage; the same markup takes
// whichever look paints it.
export function Skins(props: { group: string }) {
  return (
    <Grid
      min="md"
      cols={2}
      gap="group"
    >
      <Stack
        gap="related"
        data-skin="card"
      >
        <Row
          gap="related"
          wrap
        >
          <button data-skin="button">Deploy</button>
          <button
            data-skin="button"
            data-look="outline"
          >
            Preview
          </button>
          <button
            data-skin="button"
            disabled
          >
            Paused
          </button>
        </Row>
        <label data-part="label">
          Project
          <input
            data-skin="field"
            value="storefront"
          />
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
    <Stack
      gap="related"
      data-skin="card"
    >
      <label data-part="option">
        <input
          type="checkbox"
          data-skin="check"
          checked
        />
        Preview every push
      </label>
      <Row gap="group">
        <label data-part="option">
          <input
            type="radio"
            name={group()}
            data-skin="check"
            checked
          />
          Node
        </label>
        <label data-part="option">
          <input
            type="radio"
            name={group()}
            data-skin="check"
          />
          Bun
        </label>
      </Row>
      <label data-part="option">
        <input
          type="checkbox"
          role="switch"
          data-skin="switch"
          checked
        />
        Deploy on push
      </label>
      <label data-part="label">
        Build minutes
        <input
          type="range"
          data-skin="range"
          value="60"
        />
      </label>
      <Row
        gap="tight"
        wrap
      >
        <button
          data-skin="chip"
          aria-pressed="true"
        >
          Live
        </button>
        <button
          data-skin="chip"
          aria-pressed="false"
        >
          Building
        </button>
      </Row>
    </Stack>
  )
}

export const lookStyle = (name: LookName, rest = '') =>
  `${rest};--stage-on-fill:${LOOKS[name].style.onFill}`

// A select the stage draws, list and all. Its list floats
// in the top layer as a stage of its own, in the look it
// opened
// from, so it is never clipped and nothing under it shows
// through.
export const Choose = () => (
  <div
    data-skin="card"
    style={
      'display:grid;gap:14px;' +
      'inline-size:min(340px, 100%)'
    }
  >
    <label data-part="label">
      Region
      <StageSelect
        name="region"
        options={[
          'eu-west',
          'us-east',
          'ap-south',
          'sa-east',
        ]}
      />
    </label>
    <label data-part="label">
      Plan
      <StageSelect
        name="plan"
        value="team"
        options={[
          { value: 'hobby', label: 'Hobby' },
          { value: 'team', label: 'Team' },
          {
            value: 'scale',
            label: 'Scale (talk to us)',
            disabled: true,
          },
        ]}
      />
    </label>
  </div>
)

// The landing page: everything you see is painted by the
// stage, in whichever look, and it still reflows,
// scrolls,
// focuses and reads as HTML. The look switch remounts the
// same markup under a different set of painters.
export type Look = 'dither' | LookName

export {
  LAND_WRAP,
  LAND_SECTION,
  DISPLAY,
  LEDE,
  H2,
  LAND_FEATURES,
  LAND_PLANS,
  LAND_FAQ,
} from './landing-content'

export const jump = (e: MouseEvent, to?: string) => {
  e.preventDefault()
  const page = (
      e.currentTarget as HTMLElement
    ).closest<HTMLElement>('[data-layout="scroll"]'),
    target = to
      ? page?.querySelector<HTMLElement>(
          `[data-land="${to}"]`,
        )
      : undefined
  page?.scrollTo({
    top: target ? target.offsetTop - 64 : 0,
    behavior: 'smooth',
  })
}

// One stage in the chosen look: `role` says which of the
// page's three stages it is. The look is fixed for its
// life.
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
  if (name === 'dither')
    return ditherStage(part, () => children, rest)
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
      <CanvasStage
        {...rest}
        {...kit.stage}
        background={kit.plain}
        style={plain}
      >
        {children}
      </CanvasStage>
    )
  return (
    <CanvasStage
      {...rest}
      {...kit.stage}
      layout="page"
      veil
      background={kit.veil}
      style={plain}
    >
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
      <DitherStage
        {...rest}
        ground={0}
        style="background:var(--veneer-color-surface)"
      >
        {children()}
      </DitherStage>
    )
  return (
    <DitherStage
      {...rest}
      layout="page"
      veil={0.5}
      ground={0}
    >
      {children()}
    </DitherStage>
  )
}
