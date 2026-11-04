import type { JSX } from 'solid-js'

import { EXPRESSION_SPEC, face, faceExtras, type LemonExpression } from './face'
import { C, SW } from './palette'

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

/* ─────────────── Form helper: outline + shade + offset light fill ─────────────── */

function form(
  id: string,
  shapes: Draw,
  fill: string,
  shade: string,
  offset: Pt = [-2, -2.4],
  extra?: Draw | null,
) {
  return (
    <g>
      <defs>
        <clipPath id={id}>{shapes()}</clipPath>
      </defs>
      <g fill={C.line} stroke={C.line} stroke-width={SW * 2} stroke-linejoin="round">
        {shapes()}
      </g>
      <g fill={shade}>{shapes()}</g>
      <g clip-path={`url(#${id})`}>
        <g fill={fill} transform={`translate(${offset[0]} ${offset[1]})`}>
          {shapes()}
        </g>
        {extra?.()}
      </g>
    </g>
  )
}

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

/* ─────────────── Body parts ─────────────── */

const LEMON_PATH =
  'M100 17 C107 17 111 21.5 115 24.5 C146 32 165 57 165 90 C165 126 139 151 113 157 C108.5 158.5 106 164.5 100 164.5 C94 164.5 91.5 158.5 87 157 C61 151 35 126 35 90 C35 57 54 32 85 24.5 C89 21.5 93 17 100 17 Z'

function head(uid: string, expression: () => LemonExpression) {
  const tilt = () => EXPRESSION_SPEC[expression()].tilt ?? 0
  return (
    <g class="lemon-bob">
      <g transform={tilt() ? `rotate(${tilt()} 100 158)` : undefined}>
        {/* Leaf + stem */}
        <path
          d="M100 19 Q99.5 12 102.5 6.5"
          fill="none"
          stroke={C.line}
          stroke-width={SW * 1.1}
          stroke-linecap="round"
        />
        {form(
          `${uid}-leaf`,
          () => (
            <path d="M103 14 C108 1 127 -6 143 0.5 C136 15 118 22 103 14 Z" />
          ),
          C.leaf,
          C.leafShade,
          [-1.5, -3],
          () => (
            <path
              d="M106 12.5 Q123 9 138 2.5"
              fill="none"
              stroke={C.leafShade}
              stroke-width={1.8}
              stroke-linecap="round"
            />
          ),
        )}
        {/* Lemon body = head */}
        {form(
          `${uid}-lemon`,
          () => (
            <path d={LEMON_PATH} />
          ),
          C.lemon,
          C.lemonShade,
          [-5.5, -5],
          () => (
            <g>
              <ellipse
                cx={64}
                cy={50}
                rx={13}
                ry={6.2}
                fill={C.lemonHi}
                transform="rotate(-38 64 50)"
              />
              <circle cx={51.5} cy={65} r={3.2} fill={C.lemonHi} />
              <g fill={C.lemonShade}>
                <circle cx={150} cy={60} r={1.4} />
                <circle cx={155} cy={74} r={1.2} />
                <circle cx={146} cy={132} r={1.3} />
                <circle cx={50} cy={124} r={1.2} />
                <circle cx={58} cy={136} r={1.4} />
              </g>
            </g>
          ),
        )}
        {face(expression())}
      </g>
    </g>
  )
}

function shoe(uid: string, side: 'l' | 'r') {
  const x = side === 'l' ? 83 : 117
  return (
    <g transform={`translate(${x} 243) ${side === 'l' ? 'scale(-1 1)' : ''}`}>
      {form(
        `${uid}-shoe-${side}`,
        () => (
          <path d="M-12 -1 L-12.5 -9 Q-12.5 -17 -4.5 -17 L3 -17 Q8 -17 10 -12 Q20.5 -10.5 22 -3.5 L22 -1 Z" />
        ),
        C.sneaker,
        C.sneakerShade,
        [-2, -2],
        () => (
          <path
            d="M-2.5 -16 L1.5 -11.5 M3.5 -16.5 L7 -12.5"
            stroke={C.sole}
            stroke-width={2.2}
            stroke-linecap="round"
          />
        ),
      )}
      <path
        d="M-14.5 -4 L23 -4 Q25 -4 25 -2 L25 1 Q25 3.5 22.5 3.5 L-12.5 3.5 Q-14.5 3.5 -14.5 1.5 Z"
        fill={C.sole}
        stroke={C.line}
        stroke-width={SW}
        stroke-linejoin="round"
      />
    </g>
  )
}

function lowerBody(uid: string) {
  return (
    <g>
      {/* Legs (lemon-yellow, like the original art) */}
      {form(
        `${uid}-legs`,
        () => (
          <>
            <rect x={77} y={206} width={12} height={32} rx={6} />
            <rect x={111} y={206} width={12} height={32} rx={6} />
          </>
        ),
        C.lemon,
        C.lemonShade,
        [-2.5, 0],
      )}
      {shoe(uid, 'l')}
      {shoe(uid, 'r')}
      {/* Shorts */}
      {form(
        `${uid}-shorts`,
        () => (
          <path d="M65 188 L135 188 L138.5 212 Q139 216 135 216 L106 216 Q102 216 101.4 212 L100 203 L98.6 212 Q98 216 94 216 L65 216 Q61 216 61.5 212 Z" />
        ),
        C.shorts,
        C.shortsShade,
        [-2.5, -2.5],
      )}
    </g>
  )
}

function torso(uid: string) {
  return (
    <g>
      {form(
        `${uid}-torso`,
        () => (
          <path d="M66 150 Q58 152 57.5 160 L54 191 Q53 199 61 199 L139 199 Q147 199 146 191 L142.5 160 Q142 152 134 150 Z" />
        ),
        C.hoodie,
        C.hoodieShade,
        [-3, -3],
        () => (
          <g fill={C.hoodieShade}>
            {/* Kangaroo pocket + ribbed hem as flat shade shapes, no extra lines */}
            <path d="M77 176 Q100 172.5 123 176 L128.5 192 L71.5 192 Z" />
            <rect x={50} y={192.5} width={100} height={10} />
          </g>
        ),
      )}
      {/* Hood bunched around the base of the lemon */}
      {form(
        `${uid}-hood`,
        () => (
          <path d="M54 156 Q52 142 70 140 L130 140 Q148 142 146 156 Q145 166 128 167 L72 167 Q55 166 54 156 Z" />
        ),
        C.hoodie,
        C.hoodieShade,
        [-2.5, -3],
      )}
      {/* Drawstrings */}
      <g stroke={C.cord} stroke-width={2.6} stroke-linecap="round" fill="none">
        <path d="M91 163 Q89.5 172 90.5 180" />
        <path d="M109 163 Q110.5 172 109.5 180" />
      </g>
      <g fill={C.cord} stroke={C.line} stroke-width={SW * 0.7}>
        <rect x={87.8} y={178} width={5.4} height={7.5} rx={2.7} />
        <rect x={106.8} y={178} width={5.4} height={7.5} rx={2.7} />
      </g>
    </g>
  )
}

function clipboard(uid: string) {
  return (
    <g transform="translate(99 192) rotate(-6)">
      {form(
        `${uid}-board`,
        () => (
          <rect x={-25} y={-30} width={50} height={60} rx={5.5} />
        ),
        '#d39a55',
        '#b57d3c',
        [-2, -2],
      )}
      <rect x={-19.5} y={-21} width={39} height={45} rx={3} fill="#fff" />
      <g stroke={C.line} stroke-width={2} stroke-linecap="round" opacity={0.75}>
        <path d="M-5 -10 L13 -10 M-5 0 L13 0 M-5 10 L8 10" />
      </g>
      <path
        d="M-14.5 -10.5 L-12 -7.5 L-8 -13 M-14.5 -0.5 L-12 2.5 L-8 -3"
        stroke={C.sneakerShade}
        stroke-width={2.2}
        stroke-linecap="round"
        stroke-linejoin="round"
        fill="none"
      />
      <rect
        x={-10}
        y={-34}
        width={20}
        height={9}
        rx={2.5}
        fill="#cfd6e2"
        stroke={C.line}
        stroke-width={SW * 0.85}
      />
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
