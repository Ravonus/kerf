import type { JSX } from 'solid-js'

import { faceExtras, type LemonExpression } from './face'
import { C, SW } from './palette'
import { form } from './rig/form'
import { clipboard, head, lowerBody, torso } from './rig/body'

/*
 * Lemon's body rig. Plain render functions: `form()` draws one silhouette four times, so a
 * shape is a thunk that makes fresh DOM on each call.
 *
 * Construction rules (see /brand):
 * - Every form = one silhouette outline (navy, SW) + base fill + ONE flat shade.
 *   The shade is the base shape in a darker tint with the light fill offset up-left
 *   and clipped to the silhouette, so it always hugs the lower-right edge.
 * - Overlapping shapes in a form merge into one outline (outline pass, then fills).
 * - Arms are separate groups driven by pose data, so poses swap cleanly.
 */

export const POSES = [
  'idle',
  'wave',
  'point',
  'present',
  'think',
  'celebrate',
  'thumbsUp',
  'clipboard',
] as const
export type LemonPose = (typeof POSES)[number]

export const VIEWBOX = { x: -8, y: -16, w: 216, h: 272 } as const

type Pt = readonly [number, number]

type Draw = () => JSX.Element

/* ─────────────── Hands (local space: wrist at 0,0; fingers toward +y) ─────────────── */

type HandKind = 'rest' | 'palm' | 'point' | 'fist' | 'thumb'

const HANDS: Record<HandKind, { shapes: Draw; detail?: Draw }> = {
  rest: {
    shapes: () => (
      <>
        <ellipse cx={0} cy={13} rx={10.5} ry={11.5} />
        <ellipse cx={-9.5} cy={9} rx={4.6} ry={6.6} transform="rotate(28 -9.5 9)" />
      </>
    ),
  },
  palm: {
    shapes: () => (
      <>
        {[-30, -2, 26].map((a) => (
          <rect x={-4.9} y={4} width={9.8} height={29} rx={4.9} transform={`rotate(${a} 0 9)`} />
        ))}
        <rect x={-4.6} y={2} width={9.2} height={21} rx={4.6} transform="rotate(84 0 9)" />
        <circle cx={0} cy={11} r={12.5} />
      </>
    ),
  },
  point: {
    shapes: () => (
      <>
        <rect x={-6.4} y={10} width={7.6} height={24} rx={3.8} />
        <rect x={-10} y={2} width={20} height={19} rx={8.5} />
      </>
    ),
    detail: () => (
      <path
        d="M2 12 L6 12"
        stroke={C.line}
        stroke-width={SW * 0.55}
        stroke-linecap="round"
        opacity={0.55}
      />
    ),
  },
  fist: {
    shapes: () => <rect x={-10.5} y={2} width={21} height={20} rx={9} />,
    detail: () => (
      <g>
        <ellipse
          cx={-4}
          cy={8.5}
          rx={6.4}
          ry={3.8}
          fill={C.glove}
          stroke={C.line}
          stroke-width={SW * 0.8}
          transform="rotate(-12 -4 8.5)"
        />
      </g>
    ),
  },
  thumb: {
    shapes: () => (
      <>
        <rect x={-10.5} y={2} width={21} height={20} rx={8.5} />
        <rect x={-10} y={10} width={9.5} height={24} rx={4.75} />
      </>
    ),
    detail: () => (
      <path
        d="M3 9 L9 9 M3 15 L9 15"
        stroke={C.line}
        stroke-width={SW * 0.55}
        stroke-linecap="round"
        opacity={0.55}
      />
    ),
  },
}

function glove(id: string, kind: HandKind) {
  const h = HANDS[kind]
  return (
    <g>
      {form(id, h.shapes, C.glove, C.gloveShade, [-1.6, -1.8], h.detail)}
      {/* Rolled cuff */}
      <rect
        x={-8.5}
        y={-3.5}
        width={17}
        height={7.5}
        rx={3.75}
        fill={C.glove}
        stroke={C.line}
        stroke-width={SW}
      />
    </g>
  )
}

/* ─────────────── Arms ─────────────── */

type ArmSpec = {
  c: Pt
  w: Pt
  hand: HandKind
  /** Extra rotation of the hand around the wrist, degrees. */
  rot?: number
  /** Mirror the hand so the thumb faces the other way. */
  mirror?: boolean
  wave?: boolean
}

const SHOULDER: Record<'l' | 'r', Pt> = { l: [69, 160], r: [131, 160] }

const REST_L: ArmSpec = { c: [57, 174], w: [53, 190], hand: 'rest', rot: 6, mirror: true }
const REST_R: ArmSpec = { c: [143, 174], w: [147, 190], hand: 'rest', rot: -6 }

const POSE_ARMS: Record<LemonPose, { l: ArmSpec; r: ArmSpec; prop?: 'clipboard'; order?: 'rl' }> = {
  idle: { l: REST_L, r: REST_R },
  wave: { l: REST_L, r: { c: [158, 150], w: [167, 128], hand: 'palm', wave: true, mirror: true } },
  point: { l: REST_L, r: { c: [154, 164], w: [173, 151], hand: 'point', rot: 0, mirror: true } },
  present: { l: REST_L, r: { c: [152, 176], w: [170, 166], hand: 'palm', rot: -18, mirror: true } },
  think: {
    l: REST_L,
    r: { c: [160, 190], w: [133, 166], hand: 'point', rot: 14, mirror: true },
  },
  celebrate: {
    l: { c: [46, 150], w: [33, 126], hand: 'fist', mirror: true },
    r: { c: [154, 150], w: [167, 126], hand: 'fist' },
  },
  thumbsUp: { l: REST_L, r: { c: [160, 178], w: [161, 152], hand: 'thumb', mirror: true } },
  clipboard: {
    l: { c: [56, 200], w: [72, 199], hand: 'fist', rot: 0, mirror: true },
    r: { c: [156, 196], w: [140, 194], hand: 'point', rot: 0 },
    prop: 'clipboard',
  },
}

const deg = (a: Pt, b: Pt) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
const unit = (a: Pt, b: Pt): Pt => {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l = Math.hypot(dx, dy) || 1
  return [-dy / l, dx / l]
}
const f = (n: number) => Math.round(n * 100) / 100

function arm(id: string, s: Pt, spec: ArmSpec) {
  const { c, w } = spec
  const ws = 15.5
  const ww = 12
  const ns = unit(s, c)
  const nc = unit(s, w)
  const nw = unit(c, w)
  const side = (k: 1 | -1, half: number, n: Pt, p: Pt): string =>
    `${f(p[0] + n[0] * half * k)} ${f(p[1] + n[1] * half * k)}`
  const mid = (ws + ww) / 4
  const a1 = side(1, ws / 2, ns, s)
  const a2 = side(1, mid * 1.05, nc, c)
  const a3 = side(1, ww / 2, nw, w)
  const b1 = side(-1, ws / 2, ns, s)
  const b2 = side(-1, mid * 1.05, nc, c)
  const b3 = side(-1, ww / 2, nw, w)
  const angle = deg(c, w) - 90 + (spec.rot ?? 0)

  return (
    <g>
      <path d={`M${a1} Q${a2} ${a3} L${b3} Q${b2} ${b1} Z`} fill={C.hoodie} />
      <path
        d={`M${a1} Q${a2} ${a3} M${b1} Q${b2} ${b3}`}
        fill="none"
        stroke={C.line}
        stroke-width={SW}
        stroke-linecap="round"
      />
      <g transform={`translate(${f(w[0])} ${f(w[1])}) rotate(${f(angle)})`}>
        <g class={spec.wave ? 'lemon-wave' : undefined}>
          <g transform={spec.mirror ? 'scale(-1 1)' : undefined}>{glove(id, spec.hand)}</g>
        </g>
      </g>
    </g>
  )
}

/* ─────────────── Figure ─────────────── */

export type LemonFigureProps = {
  expression: LemonExpression
  pose: LemonPose
  /** Unique id prefix for clip paths (any page-unique string). */
  uid: string
  /** Draw a soft ground shadow. */
  shadow?: boolean
}

/** The figure's <g> contents (everything inside the <svg>). */
export function lemonFigure({ expression, pose, uid, shadow = true }: LemonFigureProps) {
  const arms = POSE_ARMS[pose]
  const left = () => arm(`${uid}-hl`, SHOULDER.l, arms.l)
  const right = () => arm(`${uid}-hr`, SHOULDER.r, arms.r)
  return (
    <g>
      {shadow && (
        <ellipse
          class={pose === 'celebrate' ? 'lemon-shadow-hop' : undefined}
          cx={100}
          cy={247}
          rx={44}
          ry={5.5}
          fill={C.shadow}
          opacity={0.13}
        />
      )}
      <g class={pose === 'celebrate' ? 'lemon-hop' : undefined}>
        {lowerBody(uid)}
        <g class="lemon-breathe">
          {torso(uid)}
          {head(uid, () => expression)}
          {arms.prop === 'clipboard' && clipboard(uid)}
          {arms.order === 'rl' ? (
            <>
              {right()}
              {left()}
            </>
          ) : (
            <>
              {left()}
              {right()}
            </>
          )}
        </g>
      </g>
      {faceExtras(expression)}
    </g>
  )
}

/** Head-only contents for the avatar badge (crop with AVATAR_VIEWBOX). */
export function lemonHead({ expression, uid }: { expression: () => LemonExpression; uid: string }) {
  return (
    <g>
      {form(
        `${uid}-hood`,
        () => (
          <path d="M30 172 Q28 146 70 140 L130 140 Q172 146 170 172 Z" />
        ),
        C.hoodie,
        C.hoodieShade,
        [-2.5, -3],
      )}
      {head(uid, expression)}
    </g>
  )
}

export const AVATAR_VIEWBOX = '6 -8 188 188'
