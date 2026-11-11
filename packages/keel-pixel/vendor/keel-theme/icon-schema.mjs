import './glyph-theme.mjs';
import {
  rgba,
} from './color-font.mjs';
import {
  add2,
  arrowHead,
  cut,
  disc,
  gear,
  poly,
  rect,
  seg,
  star,
  strokes,
  sword,
} from './glyph-theme.mjs';

var ICON_RECIPES = {
  attack: { tone: "bad", variants: [
    (S, w) => sword(S, w, S.chance(0.5)),
    (S, w) => [...sword(S, w, false), ...sword(S, w, true)],
    (S, w) => {
      const r = S.between(0.28, 0.34);
      return [add2(...strokes([[0.5, 0.08], [0.5, 0.3]], w), ...strokes([[0.5, 0.7], [0.5, 0.92]], w), ...strokes([[0.08, 0.5], [0.3, 0.5]], w), ...strokes([[0.7, 0.5], [0.92, 0.5]], w), disc(0.5, 0.5, r)), cut(disc(0.5, 0.5, r - w)), add2(disc(0.5, 0.5, w * 0.7))];
    }
  ] },
  move: { tone: "good", variants: [
    (S, w) => {
      const t = S.between(0.2, 0.3);
      return [add2(seg(0.18, 0.82, 0.72, 0.28, w * 1.4), arrowHead(0.86, 0.14, 1, -1, t + 0.1))];
    },
    (S, w) => [add2(...strokes([[0.18, 0.2], [0.46, 0.5], [0.18, 0.8]], w * 1.4)), add2(...strokes([[0.5, 0.2], [0.78, 0.5], [0.5, 0.8]], w * 1.4))],
    (S, w) => {
      const h = S.between(0.14, 0.2);
      return [add2(seg(0.5, 0.18, 0.5, 0.82, w * 1.2), seg(0.18, 0.5, 0.82, 0.5, w * 1.2), arrowHead(0.5, 0.06, 0, -1, h), arrowHead(0.5, 0.94, 0, 1, h), arrowHead(0.06, 0.5, -1, 0, h), arrowHead(0.94, 0.5, 1, 0, h))];
    }
  ] },
  stop: { tone: "bad", variants: [
    (S) => {
      const r = S.between(0.4, 0.44);
      return [add2(star(0.5, 0.5, r, r, 4, Math.PI / 8))];
    },
    (S) => {
      const m = S.between(0.14, 0.2);
      return [add2(rect(m, m, 1 - m, 1 - m))];
    }
  ] },
  hold: { tone: "accent", variants: [
    (S) => {
      const n = S.between(0.62, 0.72);
      return [add2(poly([0.14, 0.14], [0.86, 0.14], [0.86, n - 0.1], [0.5, 0.92], [0.14, n - 0.1]))];
    },
    (S, w) => [add2(rect(0.2, 0.44, 0.8, 0.88), ...strokes([[0.32, 0.46], [0.32, 0.28], [0.5, 0.12], [0.68, 0.28], [0.68, 0.46]], w * 1.2))]
  ] },
  patrol: { tone: "accent", variants: [
    (S, w) => [add2(seg(0.14, 0.34, 0.74, 0.34, w * 1.3), arrowHead(0.9, 0.34, 1, 0, 0.2), seg(0.26, 0.68, 0.86, 0.68, w * 1.3), arrowHead(0.1, 0.68, -1, 0, 0.2))],
    (S, w) => [add2(disc(0.5, 0.5, 0.38)), cut(disc(0.5, 0.5, 0.38 - w * 1.4), rect(0.5, 0, 1, 0.5)), add2(arrowHead(0.5 + 0.38 - w * 0.7, 0.62, 0, -1, 0.22))]
  ] },
  build: { tone: "warn", variants: [
    (S, w) => {
      const h = S.between(0.18, 0.24);
      return [add2(seg(0.24, 0.86, 0.62, 0.36, w * 1.4)), add2(poly([0.38, 0.28], [0.62, 0.06], [0.94, 0.38], [0.72, 0.6]), seg(0.46, 0.2, 0.46 - h, 0.2 - h * 0.2, w))];
    },
    (S, w) => [add2(seg(0.2, 0.82, 0.6, 0.42, w * 1.6), disc(0.68, 0.32, 0.22)), cut(poly([0.68, 0.32], [0.95, 0.1], [0.95, 0.4]), disc(0.2, 0.82, w * 0.4))],
    () => [add2(rect(0.08, 0.2, 0.46, 0.44), rect(0.54, 0.2, 0.92, 0.44), rect(0.08, 0.52, 0.28, 0.76), rect(0.36, 0.52, 0.64, 0.76), rect(0.72, 0.52, 0.92, 0.76))]
  ] },
  upgrade: { tone: "good", variants: [
    (S, w) => [add2(rect(0.36, 0.44, 0.64, 0.9), poly([0.5, 0.08], [0.9, 0.5], [0.1, 0.5]))],
    (S, w) => [add2(...strokes([[0.16, 0.5], [0.5, 0.2], [0.84, 0.5]], w * 1.6)), add2(...strokes([[0.16, 0.82], [0.5, 0.52], [0.84, 0.82]], w * 1.6))],
    (S, w) => [add2(star(0.44, 0.52, 0.4, 0.18, 5)), add2(seg(0.8, 0.08, 0.8, 0.34, w), seg(0.67, 0.21, 0.93, 0.21, w))]
  ] },
  supply: { tone: "warn", variants: [
    (S) => {
      const r = S.between(0.4, 0.5);
      return [add2(poly([0.5, 0.08], [0.92, r], [0.8, r], [0.8, 0.9], [0.2, 0.9], [0.2, r], [0.08, r])), cut(rect(0.42, 0.62, 0.58, 0.9))];
    },
    () => [add2(disc(0.5, 0.28, 0.18), poly([0.16, 0.92], [0.2, 0.6], [0.36, 0.5], [0.64, 0.5], [0.8, 0.6], [0.84, 0.92]))],
    (S, w) => [add2(rect(0.12, 0.18, 0.88, 0.86)), cut(rect(0.12 + w, 0.18 + w, 0.88 - w, 0.86 - w)), add2(seg(0.12, 0.18, 0.88, 0.86, w), seg(0.88, 0.18, 0.12, 0.86, w))]
  ] },
  resource: { tone: "accent", variants: [
    (S) => {
      const t = S.between(0.3, 0.4);
      return [add2(poly([0.5, 0.06], [0.88, t], [0.5, 0.94], [0.12, t]))];
    },
    () => [add2(poly([0.3, 0.9], [0.22, 0.4], [0.36, 0.12], [0.5, 0.4], [0.46, 0.9]), poly([0.5, 0.9], [0.56, 0.3], [0.7, 0.06], [0.82, 0.32], [0.76, 0.9]))]
  ] },
  mass: { tone: "accent", variants: [
    () => [add2(poly([0.5, 0.08], [0.9, 0.28], [0.9, 0.72], [0.5, 0.92], [0.1, 0.72], [0.1, 0.28]))],
    () => [add2(poly([0.2, 0.36], [0.8, 0.36], [0.94, 0.76], [0.06, 0.76]))]
  ] },
  energy: { tone: "warn", variants: [
    (S) => {
      const k = S.between(0.44, 0.54);
      return [add2(poly([0.62, 0.04], [0.2, k + 0.06], [0.48, k + 0.06], [0.36, 0.96], [0.82, k - 0.08], [0.54, k - 0.08]))];
    },
    (S, w) => [add2(disc(0.5, 0.5, 0.22), disc(0.5, 0.5, 0.44, 0.2)), cut(disc(0.5, 0.5, 0.44 - w, 0.2 - w)), add2(disc(0.5, 0.5, 0.22))]
  ] },
  biomass: { tone: "good", variants: [
    (S, w) => [add2(poly([0.14, 0.86], [0.2, 0.4], [0.5, 0.14], [0.9, 0.1], [0.84, 0.5], [0.6, 0.8])), cut(seg(0.2, 0.8, 0.7, 0.3, w * 0.8))],
    () => [add2(poly([0.5, 0.06], [0.78, 0.5], [0.7, 0.8], [0.5, 0.92], [0.3, 0.8], [0.22, 0.5]), disc(0.5, 0.64, 0.28))]
  ] },
  salvage: { tone: "ink", variants: [
    (S, w) => {
      const t = S.pick([6, 7, 8]);
      return [add2(gear(0.5, 0.5, 0.46, t, 0.12)), cut(disc(0.5, 0.5, 0.14))];
    },
    () => [add2(star(0.5, 0.5, 0.44, 0.44, 3, Math.PI / 2)), cut(disc(0.5, 0.5, 0.14))]
  ] },
  gather: { tone: "warn", variants: [
    (S, w) => [add2(seg(0.22, 0.88, 0.62, 0.36, w * 1.3)), add2(...strokes([[0.18, 0.3], [0.48, 0.14], [0.66, 0.2], [0.84, 0.44]], w * 1.5))]
  ] },
  repair: { tone: "good", variants: [
    (S, w) => [add2(seg(0.2, 0.82, 0.6, 0.42, w * 1.6), disc(0.68, 0.32, 0.22)), cut(poly([0.68, 0.32], [0.95, 0.1], [0.95, 0.4]))],
    (S) => {
      const t = S.between(0.14, 0.18);
      return [add2(rect(0.5 - t, 0.12, 0.5 + t, 0.88), rect(0.12, 0.5 - t, 0.88, 0.5 + t))];
    }
  ] },
  cancel: { tone: "bad", variants: [(S, w) => [add2(seg(0.16, 0.16, 0.84, 0.84, w * 1.8), seg(0.84, 0.16, 0.16, 0.84, w * 1.8))]] },
  rally: { tone: "accent", variants: [
    (S, w) => [add2(seg(0.24, 0.08, 0.24, 0.94, w * 1.2), poly([0.24, 0.1], [0.86, 0.26], [0.24, 0.5]))],
    (S, w) => [add2(seg(0.24, 0.08, 0.24, 0.94, w * 1.2), poly([0.24, 0.1], [0.84, 0.1], [0.7, 0.28], [0.84, 0.46], [0.24, 0.46]))]
  ] },
  research: { tone: "accent", variants: [
    () => [add2(poly([0.38, 0.08], [0.62, 0.08], [0.62, 0.36], [0.9, 0.9], [0.1, 0.9], [0.38, 0.36]))],
    (S, w) => [add2(rect(0.14, 0.14, 0.86, 0.86)), cut(seg(0.5, 0.2, 0.5, 0.86, w)), cut(rect(0.14 + w, 0.26, 0.44, 0.3), rect(0.56, 0.26, 0.86 - w, 0.3))]
  ] },
  train: { tone: "ink", variants: [
    () => [add2(disc(0.5, 0.26, 0.18), poly([0.18, 0.92], [0.24, 0.56], [0.5, 0.46], [0.76, 0.56], [0.82, 0.92]))],
    (S, w) => [add2(disc(0.5, 0.56, 0.36), rect(0.1, 0.56, 0.9, 0.7)), cut(rect(0, 0.7, 1, 1), rect(0.34, 0.5, 0.66, 0.6))]
  ] },
  ability: { tone: "accent", variants: [
    (S) => {
      const n = S.pick([4, 5, 6]);
      return [add2(star(0.5, 0.5, 0.46, S.between(0.16, 0.24), n))];
    },
    (S, w) => [add2(poly([0.5, 0.06], [0.9, 0.5], [0.5, 0.94], [0.1, 0.5])), cut(poly([0.5, 0.06 + w * 2], [0.9 - w * 2, 0.5], [0.5, 0.94 - w * 2], [0.1 + w * 2, 0.5])), add2(seg(0.5, 0.26, 0.5, 0.74, w))]
  ] },
  vision: { tone: "ink", variants: [
    (S, w) => [add2(disc(0.5, 0.5, 0.46, 0.26)), cut(disc(0.5, 0.5, 0.46 - w, 0.26 - w)), add2(disc(0.5, 0.5, 0.14))]
  ] },
  cloak: { tone: "dim", variants: [
    (S, w) => [add2(disc(0.5, 0.5, 0.46, 0.26)), cut(disc(0.5, 0.5, 0.46 - w, 0.26 - w)), add2(disc(0.5, 0.5, 0.14), seg(0.14, 0.86, 0.86, 0.14, w))]
  ] },
  scan: { tone: "good", variants: [
    (S, w) => [add2(disc(0.5, 0.5, 0.44)), cut(disc(0.5, 0.5, 0.44 - w)), add2(disc(0.5, 0.5, 0.22)), cut(disc(0.5, 0.5, 0.22 - w)), add2(seg(0.5, 0.5, 0.82, 0.2, w), disc(0.5, 0.5, w))]
  ] },
  armor: { tone: "ink", variants: [
    () => [add2(poly([0.14, 0.14], [0.86, 0.14], [0.86, 0.52], [0.5, 0.92], [0.14, 0.52]))],
    (S, w) => [add2(poly([0.14, 0.14], [0.86, 0.14], [0.86, 0.52], [0.5, 0.92], [0.14, 0.52])), cut(seg(0.5, 0.14, 0.5, 0.92, w * 0.8))]
  ] },
  damage: { tone: "bad", variants: [
    (S) => {
      const n = S.pick([7, 8, 9]);
      return [add2(star(0.5, 0.5, 0.48, S.between(0.2, 0.28), n, S.between(0, 1)))];
    }
  ] },
  speed: { tone: "good", variants: [
    (S, w) => [add2(poly([0.08, 0.16], [0.46, 0.5], [0.08, 0.84], [0.22, 0.5])), add2(poly([0.46, 0.16], [0.9, 0.5], [0.46, 0.84], [0.6, 0.5]))]
  ] },
  range: { tone: "accent", variants: [
    (S, w) => [add2(disc(0.5, 0.5, 0.46)), cut(disc(0.5, 0.5, 0.46 - w)), add2(disc(0.5, 0.5, 0.3)), cut(disc(0.5, 0.5, 0.3 - w)), add2(disc(0.5, 0.5, 0.12))]
  ] },
  health: { tone: "good", variants: [
    () => [add2(poly([0.5, 0.9], [0.08, 0.46], [0.08, 0.26], [0.26, 0.1], [0.5, 0.26], [0.74, 0.1], [0.92, 0.26], [0.92, 0.46]))],
    (S) => {
      const t = S.between(0.14, 0.18);
      return [add2(rect(0.5 - t, 0.12, 0.5 + t, 0.88), rect(0.12, 0.5 - t, 0.88, 0.5 + t))];
    }
  ] },
  timer: { tone: "ink", variants: [
    (S, w) => [add2(disc(0.5, 0.54, 0.4)), cut(disc(0.5, 0.54, 0.4 - w)), add2(seg(0.5, 0.54, 0.5, 0.3, w), seg(0.5, 0.54, 0.68, 0.62, w), rect(0.4, 0.04, 0.6, 0.12))]
  ] },
  // (Three bars, never so heavy they run together: each at most a sixth of the square.)
  menu: { tone: "ink", variants: [(S, w0) => {
    const w = Math.min(w0, 0.12);
    return [add2(rect(0.14, 0.16, 0.86, 0.16 + w * 1.4), rect(0.14, 0.5 - w * 0.7, 0.86, 0.5 + w * 0.7), rect(0.14, 0.84 - w * 1.4, 0.86, 0.84))];
  }] },
  settings: { tone: "ink", variants: [(S, w) => [add2(gear(0.5, 0.5, 0.46, 8, 0.12)), cut(disc(0.5, 0.5, 0.16))]] },
  alert: { tone: "warn", variants: [(S, w) => [add2(poly([0.5, 0.06], [0.95, 0.9], [0.05, 0.9])), cut(seg(0.5, 0.34, 0.5, 0.62, w * 1.2), disc(0.5, 0.76, w * 0.7))]] },
  worker: { tone: "warn", variants: [
    (S) => [add2(disc(0.5, 0.6, 0.38)), cut(rect(0, 0.62, 1, 1)), add2(rect(0.06, 0.58, 0.94, 0.7), rect(0.42, 0.14, 0.58, 0.26))],
    (S, w) => [add2(seg(0.22, 0.88, 0.62, 0.36, w * 1.3)), add2(...strokes([[0.18, 0.3], [0.48, 0.14], [0.66, 0.2], [0.84, 0.44]], w * 1.5))]
  ] },
  unload: { tone: "ink", variants: [(S, w) => [add2(rect(0.12, 0.62, 0.88, 0.9), seg(0.5, 0.08, 0.5, 0.44, w * 1.5), arrowHead(0.5, 0.58, 0, 1, 0.22))]] },
  load: { tone: "ink", variants: [(S, w) => [add2(rect(0.12, 0.62, 0.88, 0.9), seg(0.5, 0.22, 0.5, 0.58, w * 1.5), arrowHead(0.5, 0.06, 0, -1, 0.22))]] },
  "attack-move": { tone: "bad", variants: [
    (S, w) => [...sword(S, w * 0.9, false).map((o) => ({ ...o, shape: o.shape.map((c) => c.map((v, i) => i % 2 ? v * 0.72 : v * 0.72 + 0.28)) })), add2(seg(0.1, 0.9, 0.34, 0.66, w * 1.2), arrowHead(0.08, 0.92, -1, 1, 0.16))]
  ] },
  crystal: { tone: "accent", variants: [
    () => [add2(poly([0.3, 0.9], [0.22, 0.4], [0.36, 0.12], [0.5, 0.4], [0.46, 0.9]), poly([0.5, 0.9], [0.56, 0.3], [0.7, 0.06], [0.82, 0.32], [0.76, 0.9]))]
  ] },
  flux: { tone: "accent", variants: [
    (S, w) => [add2(disc(0.5, 0.5, 0.24), disc(0.5, 0.5, 0.46, 0.18)), cut(disc(0.5, 0.5, 0.46 - w, 0.18 - w)), add2(disc(0.5, 0.5, 0.24))]
  ] },
  pause: { tone: "ink", variants: [(S) => [add2(rect(0.2, 0.14, 0.42, 0.86), rect(0.58, 0.14, 0.8, 0.86))]] },
  play: { tone: "ink", variants: [() => [add2(poly([0.2, 0.1], [0.86, 0.5], [0.2, 0.9]))]] },
  close: { tone: "ink", variants: [(S, w) => [add2(seg(0.2, 0.2, 0.8, 0.8, w * 1.5), seg(0.8, 0.2, 0.2, 0.8, w * 1.5))]] },
  check: { tone: "good", variants: [(S, w) => [add2(...strokes([[0.14, 0.52], [0.4, 0.78], [0.86, 0.22]], w * 1.6))]] },
  chat: { tone: "ink", variants: [() => [add2(rect(0.1, 0.14, 0.9, 0.66), poly([0.26, 0.6], [0.5, 0.6], [0.22, 0.9]))]] },
  ping: { tone: "warn", variants: [(S, w) => [add2(disc(0.5, 0.4, 0.3), poly([0.24, 0.5], [0.5, 0.94], [0.76, 0.5])), cut(disc(0.5, 0.4, 0.12))]] }
};
var ICON_NAMES = Object.keys(ICON_RECIPES);

// packages/ui/src/node.ts
var WIDGETS = [
  "root",
  "canvas",
  "row",
  "col",
  "grid",
  "panel",
  "button",
  "label",
  "icon",
  "bar",
  "list",
  "tooltip",
  "minimap",
  "portrait",
  "tabs",
  "toast",
  "modal",
  "slider",
  "toggle",
  "spinner",
  "spacer",
  "image",
  "driving"
];
var DRIVING_KINDS = ["wheel", "accelerator", "brake", "handbrake", "boost", "speedometer", "tachometer", "combined", "shift-up", "shift-down"];
var DRIVING_VARIANTS = ["touring", "track"];
var ANCHORS = ["tl", "t", "tr", "l", "c", "r", "bl", "b", "br"];

// packages/ui/src/driving.ts
var TAU2 = Math.PI * 2;

// packages/ui/src/gauges.ts
var GLYPH_BYTES = 128 * 1024;

// packages/ui/src/prompts.ts
var DEFAULT = { face: rgba(26, 32, 52), rim: rgba(150, 170, 210), ink: rgba(240, 244, 255), lit: rgba(255, 190, 70) };

// packages/codec/src/bits.ts
var F2 = new DataView(new ArrayBuffer(8));
var P32 = 2 ** 32;
var BitError = class extends RangeError {
  bit;
  constructor(message, bit) {
    super(message);
    this.name = "BitError";
    this.bit = bit;
  }
};
function bitsFor(n) {
  if (n <= 1) return 0;
  if (n <= 4294967296) return 32 - Math.clz32(n - 1);
  let b = 32;
  let v = Math.floor((n - 1) / 4294967296);
  while (v >= 1) {
    v = Math.floor(v / 2);
    b += 1;
  }
  return b;
}
var lengthOf = (x) => x < 4294967296 ? 32 - Math.clz32(x) : 32 + lengthOf(Math.floor(x / 4294967296));
function toHalf(v) {
  F2.setFloat32(0, v);
  const x = F2.getUint32(0);
  const sign = x >>> 16 & 32768;
  const exp = x >>> 23 & 255;
  let mant = x & 8388607;
  if (exp === 255) return sign | 31744 | (mant ? 512 : 0);
  const e = exp - 127 + 15;
  if (e >= 31) return sign | 31744;
  if (e <= 0) {
    if (e < -10) return sign;
    mant |= 8388608;
    const shift = 14 - e;
    let h2 = mant >>> shift;
    const rem2 = mant & (1 << shift) - 1;
    const half = 1 << shift - 1;
    if (rem2 > half || rem2 === half && h2 & 1) h2 += 1;
    return sign | h2;
  }
  let h = e << 10 | mant >>> 13;
  const rem = mant & 8191;
  if (rem > 4096 || rem === 4096 && h & 1) h += 1;
  return sign | h;
}
function fromHalf(h) {
  const sign = h & 32768 ? -1 : 1;
  const exp = h >>> 10 & 31;
  const mant = h & 1023;
  if (exp === 0) return sign * mant * 2 ** -24;
  if (exp === 31) return mant ? NaN : sign * Infinity;
  return sign * (1 + mant / 1024) * 2 ** (exp - 15);
}
var BitWriter = class {
  buf;
  pos = 0;
  bit = 0;
  constructor(capacity = 256) {
    this.buf = new Uint8Array(Math.max(16, capacity));
  }
  /** Bits written so far. */
  get length() {
    return this.pos * 8 + this.bit;
  }
  room(bytes2) {
    if (this.pos + bytes2 < this.buf.length) return;
    let n = this.buf.length * 2;
    while (n <= this.pos + bytes2) n *= 2;
    const next = new Uint8Array(n);
    next.set(this.buf.subarray(0, this.pos + 1));
    this.buf = next;
  }
  /** Write the low `n` bits of `v` (0 <= n <= 32; v an unsigned integer below 2^n). */
  bits(v, n) {
    if (n === 0) return;
    this.room(5);
    const buf = this.buf;
    let pos = this.pos;
    let bit = this.bit;
    while (n > 0) {
      const free = 8 - bit;
      if (n >= free) {
        n -= free;
        buf[pos] = buf[pos] | v >>> n & (1 << free) - 1;
        pos += 1;
        bit = 0;
      } else {
        buf[pos] = buf[pos] | (v & (1 << n) - 1) << free - n;
        bit += n;
        n = 0;
      }
    }
    this.pos = pos;
    this.bit = bit;
  }
  /** Up to 53 bits. */
  wide(v, n) {
    if (n <= 32) {
      this.bits(v >>> 0, n);
      return;
    }
    const hi = Math.floor(v / P32);
    this.bits(hi, n - 32);
    this.bits(v >>> 0, 32);
  }
  bool(b) {
    this.bits(b ? 1 : 0, 1);
  }
  /** A bigint's low `n` bits. */
  big(v, n) {
    let left = n;
    while (left > 32) {
      left -= 32;
      this.bits(Number(v >> BigInt(left) & 0xffffffffn), 32);
    }
    this.bits(Number(v & (1n << BigInt(left)) - 1n), left);
  }
  /** Exp-Golomb of order k (k = 0: Elias-gamma of v + 1): small numbers in few bits, any size up to 2^53. */
  golomb(v, k) {
    const x = v + (k < 31 ? 1 << k : 2 ** k);
    const len2 = lengthOf(x);
    const zeros = len2 - 1 - k;
    if (zeros > 0) {
      this.room((zeros >>> 3) + 6);
      const at = this.pos * 8 + this.bit + zeros;
      this.pos = at >>> 3;
      this.bit = at & 7;
    }
    if (len2 <= 32) this.bits(x >>> 0, len2);
    else this.wide(x, len2);
  }
  /** LEB-style groups: `g` bits of the number then a "more" bit, least significant group first. */
  groups(v, g) {
    const span = 2 ** g;
    do {
      const part = v % span;
      v = Math.floor(v / span);
      this.bits(part, g);
      this.bool(v > 0);
    } while (v > 0);
  }
  f16(v) {
    this.bits(toHalf(v), 16);
  }
  f32(v) {
    F2.setFloat32(0, v);
    this.bits(F2.getUint32(0), 32);
  }
  f64(v) {
    F2.setFloat64(0, v);
    this.bits(F2.getUint32(0), 32);
    this.bits(F2.getUint32(4), 32);
  }
  /** Raw bytes (a fast copy when the stream is on a byte boundary). */
  bytes(b) {
    if (this.bit === 0) {
      this.room(b.length + 1);
      this.buf.set(b, this.pos);
      this.pos += b.length;
      return;
    }
    for (let i = 0; i < b.length; i += 1) this.bits(b[i], 8);
  }
  /** Another writer's bits, appended. */
  append(other) {
    const n = other.length;
    const src = other.buf;
    const full = n >>> 3;
    if (this.bit === 0) {
      this.room(full + 2);
      this.buf.set(src.subarray(0, full), this.pos);
      this.pos += full;
    } else for (let i = 0; i < full; i += 1) this.bits(src[i], 8);
    const rest = n & 7;
    if (rest) this.bits(src[full] >>> 8 - rest, rest);
  }
  /** Pad with zero bits to the next byte. */
  align() {
    if (this.bit) {
      this.pos += 1;
      this.bit = 0;
      this.room(1);
    }
  }
  /** The bytes (a copy), zero-padded to a whole byte. */
  finish() {
    return this.buf.slice(0, this.pos + (this.bit ? 1 : 0));
  }
  /** Empty it for reuse (keeps its buffer). */
  reset() {
    this.buf.fill(0, 0, this.pos + 1);
    this.pos = 0;
    this.bit = 0;
  }
};

// packages/codec/src/schema.ts
var SchemaError = class extends TypeError {
  constructor(message) {
    super(message);
    this.name = "SchemaError";
  }
};
var bad = (why) => {
  throw new SchemaError(why);
};
var whole = (v, lo, hi, what) => {
  if (!Number.isInteger(v) || v < lo || v > hi) bad(`${what} must be a whole number in ${lo}..${hi} (got ${v}).`);
  return v;
};
var node = (n) => Object.freeze(n);
var asNode = (t) => t;
var uint = (bits) => node({ kind: "uint", bits: whole(bits, 1, 53, "uint bits") });
var int = (bits) => node({ kind: "int", bits: whole(bits, 2, 53, "int bits") });
var bool = () => node({ kind: "bool" });
function fixed(min, max, step, { off = "round", k = -1, delta: delta2 = false } = {}) {
  if (![min, max, step].every(Number.isFinite)) bad("fixed(min, max, step) takes finite numbers.");
  if (!(step > 0)) bad(`fixed step must be positive (got ${step}).`);
  if (!(max > min)) bad(`fixed max must be above min (got ${min}..${max}).`);
  const steps = Math.round((max - min) / step);
  if (steps > 2 ** 52) bad(`fixed(${min}, ${max}, ${step}) has more than 2^52 steps.`);
  if (!["round", "strict", "exact"].includes(off)) bad(`fixed off must be "round", "strict" or "exact" (got ${off}).`);
  if (delta2 && k < 0) bad("fixed delta needs a Golomb k (the differences are Golomb-coded).");
  return node({ kind: "fixed", min, max, step, off, k: whole(k, -1, 31, "fixed k"), delta: delta2 });
}
var varuint = ({ k = 0, group = 0 } = {}) => node({ kind: "varuint", k: whole(k, 0, 31, "varuint k"), group: whole(group, 0, 31, "varuint group") });
var varint = ({ k = 0, group = 0 } = {}) => node({ kind: "varint", k: whole(k, 0, 31, "varint k"), group: whole(group, 0, 31, "varint group") });
var num = () => node({ kind: "num" });
function enumOf(values, { capacity = 0, open = false, other = false } = {}) {
  if (!values.length) bad("An enum needs values.");
  const seen = /* @__PURE__ */ new Set();
  for (const v of values) {
    const key = `${typeof v}:${String(v)}`;
    if (!["string", "number", "boolean"].includes(typeof v)) bad(`Enum values are strings, numbers or booleans (got ${typeof v}).`);
    if (seen.has(key)) bad(`Enum value ${JSON.stringify(v)} is listed twice.`);
    seen.add(key);
  }
  if (capacity && capacity < values.length) bad(`Enum capacity ${capacity} is below its ${values.length} values.`);
  return node({ kind: "enum", values: Object.freeze([...values]), capacity: whole(capacity, 0, 2 ** 32, "enum capacity"), open, other });
}
var string = ({ max = 0, packHex = false } = {}) => node({ kind: "string", max: whole(max, 0, 2 ** 32, "string max"), packHex });
var ref = (table = "str", { packHex = false } = {}) => node({ kind: "ref", table: table || bad("ref needs a table name."), packHex });
var bytes = ({ length = 0 } = {}) => node({ kind: "bytes", length: whole(length, 0, 2 ** 32, "bytes length") });
var dyn = () => node({ kind: "dyn" });
function array(of, { length = 0, max = 0 } = {}) {
  if (length && max) bad("An array has a fixed length or a max, not both.");
  return node({ kind: "array", of: asNode(of), length: whole(length, 0, 2 ** 32, "array length"), max: whole(max, 0, 2 ** 32, "array max") });
}
var optional = (of) => node({ kind: "optional", of: asNode(of), optional: true });
var fieldsOf = (fields, what) => {
  const out = [];
  for (const [name, type] of Object.entries(fields)) {
    if (!name) bad(`${what}: a field needs a name.`);
    if (!type || typeof type.kind !== "string") bad(`${what}: field ${name} is not a schema.`);
    out.push(Object.freeze({ name, type: asNode(type) }));
  }
  return out;
};
function struct(fields, { open = false } = {}) {
  return node({ kind: "struct", fields: Object.freeze(fieldsOf(fields, "struct")), open, ext: Object.freeze([]) });
}

export {
  ANCHORS,
  BitError,
  BitWriter,
  DRIVING_KINDS,
  DRIVING_VARIANTS,
  SchemaError,
  WIDGETS,
  array,
  asNode,
  bad,
  bitsFor,
  bool,
  bytes,
  dyn,
  enumOf,
  fieldsOf,
  fixed,
  fromHalf,
  int,
  node,
  num,
  optional,
  ref,
  string,
  struct,
  toHalf,
  uint,
  varint,
  varuint,
  whole,
};
