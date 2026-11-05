import { EXPRESSION_SPEC, face, type LemonExpression } from '../face'
import { C, SW } from '../palette'
import { form } from './form'

/* ─────────────── Body parts ─────────────── */

const LEMON_PATH =
  'M100 17 C107 17 111 21.5 115 24.5 C146 32 165 57 165 90 C165 126 139 151 113 157 C108.5 158.5 106 164.5 100 164.5 C94 164.5 91.5 158.5 87 157 C61 151 35 126 35 90 C35 57 54 32 85 24.5 C89 21.5 93 17 100 17 Z'

export function head(uid: string, expression: () => LemonExpression) {
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

export function lowerBody(uid: string) {
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

export function torso(uid: string) {
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

export function clipboard(uid: string) {
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
