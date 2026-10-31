import { C, SW } from "./palette";

/*
 * Face rig. Everything is in the lemon's coordinate space (viewBox units):
 * eyes sit at y≈92, brows at y≈70, mouth centred on (100, 116).
 * Brows carry most of the emotion, so each expression sets them explicitly.
 */

export const EXPRESSIONS = [
  "neutral",
  "happy",
  "excited",
  "thinking",
  "curious",
  "proud",
  "surprised",
  "encouraging",
  "laughing",
  "focused",
] as const;
export type LemonExpression = (typeof EXPRESSIONS)[number];

type EyeKind = "open" | "wide" | "happy" | "laugh" | "wink" | "focus";
type MouthKind =
  | "smile"
  | "smug"
  | "open"
  | "grin"
  | "laugh"
  | "o"
  | "ooh"
  | "hmm"
  | "smirk"
  | "set";

/** Brow pose: lift (negative = up) and inner-end angle (positive = inner end up = worried/kind). */
type Brow = readonly [lift: number, inner: number];

type ExpressionSpec = {
  eyes: readonly [EyeKind, EyeKind];
  look?: readonly [number, number];
  brows: readonly [Brow, Brow];
  mouth: MouthKind;
  blush: number;
  extra?: "sparkle" | "thought";
  tilt?: number;
};

export const EXPRESSION_SPEC: Record<LemonExpression, ExpressionSpec> = {
  neutral: { eyes: ["open", "open"], brows: [[0, 0], [0, 0]], mouth: "smile", blush: 0.3 },
  happy: { eyes: ["open", "open"], brows: [[-3, 3], [-3, 3]], mouth: "open", blush: 0.5 },
  excited: {
    eyes: ["wide", "wide"],
    brows: [[-8, 2], [-8, 2]],
    mouth: "grin",
    blush: 0.6,
    extra: "sparkle",
  },
  thinking: {
    eyes: ["open", "open"],
    look: [-3, -4],
    brows: [[-7, -2], [1, -7]],
    mouth: "hmm",
    blush: 0.15,
    extra: "thought",
    tilt: -4,
  },
  curious: { eyes: ["open", "open"], look: [3, -1], brows: [[-2, 6], [-8, 2]], mouth: "ooh", blush: 0.3, tilt: 7 },
  proud: { eyes: ["happy", "happy"], brows: [[-4, -3], [-4, -3]], mouth: "smug", blush: 0.6 },
  surprised: { eyes: ["wide", "wide"], brows: [[-10, 4], [-10, 4]], mouth: "o", blush: 0.15 },
  encouraging: { eyes: ["open", "wink"], brows: [[-5, 5], [-1, -2]], mouth: "smirk", blush: 0.5 },
  laughing: { eyes: ["laugh", "laugh"], brows: [[-6, 6], [-6, 6]], mouth: "laugh", blush: 0.7 },
  focused: { eyes: ["focus", "focus"], brows: [[1, -5], [1, -5]], mouth: "set", blush: 0.25 },
};

const EYE_X = [80, 120] as const;
const EYE_Y = 93;

function eye(kind: EyeKind, side: 0 | 1, look: readonly [number, number]) {
  const cx = EYE_X[side] + look[0];
  const cy = EYE_Y + look[1];
  const arc = { fill: "none", stroke: C.line, "stroke-width": SW * 1.35, "stroke-linecap": "round" as const };

  if (kind === "happy" || kind === "wink") {
    return <path d={`M${cx - 7.5} ${cy + 3} Q${cx} ${cy - 7} ${cx + 7.5} ${cy + 3}`} {...arc} />;
  }
  if (kind === "laugh") {
    const d = side === 0 ? 1 : -1; // > <
    return (
      <path
        d={`M${cx - 6 * d} ${cy - 6} L${cx + 5 * d} ${cy} L${cx - 6 * d} ${cy + 6}`}
        {...arc}
        stroke-linejoin="round"
      />
    );
  }
  if (kind === "focus") {
    return (
      <g class="lemon-blink">
        <path d={`M${cx - 7.2} ${cy - 3} Q${cx} ${cy - 4.5} ${cx + 7.2} ${cy - 3} Q${cx + 7.5} ${cy + 9} ${cx} ${cy + 9} Q${cx - 7.5} ${cy + 9} ${cx - 7.2} ${cy - 3} Z`} fill={C.line} />
        <circle cx={cx + 2.6} cy={cy + 1.2} r={2.2} fill="#fff" />
      </g>
    );
  }
  const rx = kind === "wide" ? 8 : 7;
  const ry = kind === "wide" ? 12 : 10.5;
  return (
    <g class="lemon-blink">
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={C.line} />
      <circle cx={cx + rx * 0.36} cy={cy - ry * 0.42} r={rx * 0.38} fill="#fff" />
      <circle cx={cx - rx * 0.32} cy={cy + ry * 0.38} r={rx * 0.15} fill="#fff" opacity={0.85} />
    </g>
  );
}

function browsOf(brows: ExpressionSpec["brows"]) {
  const [[ly, li], [ry, ri]] = brows;
  const common = { fill: "none", stroke: C.line, "stroke-width": SW * 1.75, "stroke-linecap": "round" as const };
  return (
    <g>
      <path d="M71 71 Q79.5 65.5 88 69.5" transform={`translate(0 ${ly}) rotate(${-li} 79.5 69)`} {...common} />
      <path d="M112 69.5 Q120.5 65.5 129 71" transform={`translate(0 ${ry}) rotate(${ri} 120.5 69)`} {...common} />
    </g>
  );
}

function mouth(kind: MouthKind) {
  const stroke = { fill: "none", stroke: C.line, "stroke-width": SW * 1.2, "stroke-linecap": "round" as const };
  const filled = { fill: C.line, stroke: C.line, "stroke-width": SW * 0.8, "stroke-linejoin": "round" as const };
  switch (kind) {
    case "smile":
      return <path d="M90 114 Q100 122.5 110 114" {...stroke} />;
    case "smug":
      return (
        <g>
          <path d="M86 112.5 Q100 125 114 112.5" {...stroke} />
          <path d="M84.5 110.5 L87.5 114.5 M115.5 110.5 L112.5 114.5" {...stroke} stroke-width={SW * 0.9} />
        </g>
      );
    case "open":
      return (
        <g>
          <path d="M87 111 Q100 113.5 113 111 Q112 128 100 128 Q88 128 87 111 Z" {...filled} />
          <path d="M92.5 124.5 Q100 119 107.5 124.5 Q104.5 128 100 128 Q95.5 128 92.5 124.5 Z" fill={C.tongue} />
        </g>
      );
    case "grin":
      return (
        <g>
          <path d="M83 108.5 Q100 112 117 108.5 Q116 131 100 131 Q84 131 83 108.5 Z" {...filled} />
          <path d="M85 110.3 Q100 113.2 115 110.3 L114.4 115 Q100 117.6 85.6 115 Z" fill="#fff" />
          <path d="M91 126.5 Q100 120 109 126.5 Q105 131 100 131 Q95 131 91 126.5 Z" fill={C.tongue} />
        </g>
      );
    case "laugh":
      return (
        <g>
          <path d="M84 107.5 Q100 111 116 107.5 Q116.5 135 100 135 Q83.5 135 84 107.5 Z" {...filled} />
          <path d="M89.5 129 Q100 120 110.5 129 Q106 135 100 135 Q94 135 89.5 129 Z" fill={C.tongue} />
        </g>
      );
    case "o":
      return (
        <g>
          <ellipse cx={100} cy={119} rx={6.5} ry={8.5} {...filled} />
          <ellipse cx={100} cy={124} rx={3.8} ry={2.6} fill={C.tongue} />
        </g>
      );
    case "ooh":
      return <ellipse cx={102} cy={117} rx={3.6} ry={4.4} {...filled} />;
    case "hmm":
      return <path d="M93 118 Q98 115.5 103 118 Q107 120 110 116.5" {...stroke} />;
    case "smirk":
      return (
        <g>
          <path d="M88 113 Q101 124 113 109.5" {...stroke} />
          <path d="M111 108.5 L115.5 111" {...stroke} stroke-width={SW * 0.9} />
        </g>
      );
    case "set":
      return <path d="M92 117.5 Q100 121.5 108 117.5" {...stroke} />;
  }
}

function sparkle(x: number, y: number, s: number, delay: string) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g class="lemon-twinkle" style={`animation-delay:${delay}`}>
        <path
          d="M0 -10 Q1.6 -1.6 10 0 Q1.6 1.6 0 10 Q-1.6 1.6 -10 0 Q-1.6 -1.6 0 -10 Z"
          fill={C.lemon}
          stroke={C.line}
          stroke-width={SW / s}
          stroke-linejoin="round"
        />
      </g>
    </g>
  );
}

/** Decorations that sit outside the head (rendered unrotated, on top). */
export function faceExtras(expression: LemonExpression) {
  const { extra } = EXPRESSION_SPEC[expression];
  if (extra === "sparkle") {
    return (
      <g>
        {sparkle(22, 34, 0.9, "0s")}
        {sparkle(176, 22, 1.05, "-0.6s")}
        {sparkle(186, 64, 0.6, "-1.1s")}
      </g>
    );
  }
  if (extra === "thought") {
    return (
      <g fill="#fff" stroke={C.line} stroke-width={SW * 0.85}>
        <circle cx={160} cy={40} r={3} />
        <circle cx={170} cy={28} r={4.6} />
        <circle cx={184} cy={13} r={6.6} />
      </g>
    );
  }
  return null;
}

/** The face itself. Rendered inside the head group so it follows tilt/bob. */
export function face(expression: LemonExpression) {
  const spec = EXPRESSION_SPEC[expression];
  const look = spec.look ?? ([0, 0] as const);
  return (
    <g transform="translate(100 104) scale(1.12) translate(-100 -100)">
    <g class="lemon-face">
      <g opacity={spec.blush} fill={C.blush}>
        <ellipse cx={66} cy={110} rx={8.5} ry={4.8} />
        <ellipse cx={134} cy={110} rx={8.5} ry={4.8} />
      </g>
      {browsOf(spec.brows)}
      {eye(spec.eyes[0], 0, look)}
      {eye(spec.eyes[1], 1, look)}
      {mouth(spec.mouth)}
    </g>
    </g>
  );
}
