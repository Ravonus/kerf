import type { DitherPainter } from '@kerf-js/veneer'
import { LEVEL, DitherStage, Stack } from '@kerf-js/veneer'
import { state } from '@kerf-js/core'

// A skin of your own: a battery whose cells fill to the
// meter's value. Painters get the piece's box and states,
// in cells.
export const battery: DitherPainter = (p, b) => {
  const nub = Math.max(2, Math.round(p.h / 4)),
    body = p.w - nub - 1,
    bars = 5,
    gap = 1,
    inner = body - 4,
    bar = (inner - gap * (bars - 1)) / bars
  b.ring(
    { x: p.x, y: p.y, w: body, h: p.h, r: 2 },
    LEVEL.ink,
  )
  b.paint(
    {
      x: p.x + body,
      y: p.y + nub,
      w: nub,
      h: p.h - nub * 2,
    },
    LEVEL.ink,
  )
  for (let i = 0; i < bars; i++) {
    const lit = p.value * bars - i
    b.paint(
      {
        x: p.x + 2 + i * (bar + gap),
        y: p.y + 2,
        w: bar,
        h: p.h - 4,
      },
      lit >= 1
        ? LEVEL.tone
        : lit > 0
          ? lit * LEVEL.tone
          : LEVEL.soft * p.hover,
    )
  }
}

export const PAINT_BATTERY = { battery }

export const StageOwnSkin = () => {
  const charge = state(64)
  return (
    <DitherStage
      ground={0.25}
      painters={PAINT_BATTERY}
      style="padding:28px"
    >
      <Stack
        gap="related"
        align="start"
      >
        <meter
          data-skin="battery"
          data-ramp="positive"
          min="0"
          max="100"
          value={charge.value}
          aria-label={`Battery at ${charge.value}%`}
          style="inline-size:180px;block-size:72px"
        ></meter>
        <label data-part="label">
          Charge {charge.value}%
          <input
            type="range"
            data-skin="range"
            data-ramp="positive"
            value={charge.value}
            onInput={(e: Event) =>
              (charge.value = +(
                e.currentTarget as HTMLInputElement
              ).value)
            }
            style="inline-size:240px"
          />
        </label>
      </Stack>
    </DitherStage>
  )
}
