import './color-font.mjs';
import {
  DEFAULT_FONT_RANGES,
  SCREEN_IDS,
  contrast,
  createRoll,
  deriveSeed,
  ellipse,
  fontParamsOf,
  fromOklch,
  stream,
} from './color-font.mjs';

var GLYPHS = [
  // Capitals.
  [65, "n", "M0,b L0,c~ L1,c~ L1,b M0,h L1,h"],
  // (B, D, O, S and I are at least 5 wide -- wider than the figures in a narrow family's small sizes -- so none of
  // them is ever an 8, a 0, a 5 or a 1.)
  [66, "o", "M0,b L0,c L1,c^ L1,h^ L0,h M0,h L1,h^ L1,b^ L0,b"],
  [67, "n", "M1,c L0,c~ L0,b~ L1,b"],
  [68, "o", "M0,b L0,c L1,c^ L1,b^ L0,b"],
  [69, "n", "M1,c L0,c L0,b L1,b M0,h L1-1,h"],
  [70, "n", "M1,c L0,c L0,b M0,h L1-1,h"],
  // (G: open at the top-right -- its top stops short of the corner and never turns down -- the right side rises from
  // the baseline to the middle, and a bar comes in from it; never reaching the left side, so no B-like join. At least
  // 5 px wide, room for the gap between that bar and the left stem.)
  [71, "o", "M1-2,c L0,c^ L0,b^ L1,b^ L1,h L.5+1,h"],
  [72, "n", "M0,b L0,c M1,b L1,c M0,h L1,h"],
  [73, "I", "M0,c L1,c M.5,c L.5,b M0,b L1,b"],
  [74, "n", "M1,c L1,b~ L0,b~ L0,.25"],
  [75, "n", "M0,b L0,c M1,c L0+1,h L1,b"],
  [76, "n", "M0,c L0,b L1,b"],
  [77, "w", "M0,b L0,c L.5,.45 L1,c L1,b"],
  [78, "n", "M0,b L0,c L1,b L1,c"],
  [79, "o", "M0,b~ L0,c~ L1,c~ L1,b~ Z"],
  [80, "n", "M0,b L0,c L1,c~ L1,h~ L0,h"],
  [81, "n", "M0,b~ L0,c~ L1,c~ L1,b~ Z M.5,.3 L1,b-1"],
  [82, "n", "M0,b L0,c L1,c~ L1,h^ L0,h M0+1,h L1,b"],
  [83, "o", "M1,c L0,c^ L0,h^ L1,h^ L1,b^ L0,b"],
  [84, "n", "M0,c L1,c M.5,c L.5,b"],
  [85, "n", "M0,c L0,b~ L1,b~ L1,c"],
  [86, "n", "M0,c L0,.3 L.5,b L1,.3 L1,c"],
  [87, "w", "M0,c L0,b L.5,.55 L1,b L1,c"],
  [88, "n", "M0,c L0,.75 L1,.25 L1,b M1,c L1,.75 L0,.25 L0,b"],
  [89, "n", "M0,c L0,.75 L.5,h L1,.75 L1,c M.5,h L.5,b"],
  [90, "n", "M0,c L1,c L1,.8 L0,.2 L0,b L1,b"],
  // Lower case.
  [97, "n", "M0+1,x L1,x~ L1,b M1,k L0,k~ L0,b~ L1,b"],
  [98, "n", "M0,a L0,b L1,b~ L1,x~ L0,x"],
  [99, "n", "M1,x L0,x~ L0,b~ L1,b"],
  [100, "n", "M1,a L1,b L0,b~ L0,x~ L1,x"],
  [101, "n", "M0,k L1,k L1,x~ L0,x~ L0,b~ L1-1,b"],
  [102, "s", "M1,a L.5,a~ L.5,b M0,x L1-1,x"],
  [103, "n", "M1,b L0,b~ L0,x~ L1,x L1,d~ L0,d"],
  [104, "n", "M0,a L0,b M0,x L1,x~ L1,b"],
  [105, "i", "M0,b L0,s M0,c"],
  [106, "t", "M1,s L1,d~ L0,d M1,c"],
  [107, "n", "M0,a L0,b M1,x L0+1,k L1,b"],
  [108, "i", "M0,a L0,b"],
  [109, "w", "M0,b L0,x L1,x~ L1,b M.5,x L.5,b"],
  [110, "n", "M0,b L0,x L1,x~ L1,b"],
  [111, "n", "M0,b~ L0,x~ L1,x~ L1,b~ Z"],
  [112, "n", "M0,d L0,x L1,x~ L1,b~ L0,b"],
  [113, "n", "M1,d L1,x L0,x~ L0,b~ L1,b"],
  [114, "t", "M0,b L0,x L1,x"],
  [115, "n", "M1,x L0,x~ L0,.6x L1,.4x L1,b~ L0,b"],
  // (t: a crossbar through the stem at the x-height, both sides; the stem only a little above it -- well under l's
  // ascender -- and a foot turned right, always cut, square fonts too: never an l.)
  [116, "s", "M.5,t L.5,b^ L1,b M0,x L1,x"],
  [117, "n", "M0,x L0,b~ L1,b L1,x"],
  [118, "n", "M0,x L0,.4x L.5,b L1,.4x L1,x"],
  [119, "w", "M0,x L0,b L.5,k L1,b L1,x"],
  [120, "n", "M0,x L1,b M1,x L0,b"],
  [121, "n", "M0,x L0,b~ L1,b M1,x L1,d~ L0,d"],
  [122, "n", "M0,x L1,x L0,b L1,b"],
  // Figures (tabular: all one width).
  // (Figures: 0 narrower than its cell where there's room -- an oval, never an O; 8 two stacked loops, the upper one
  // narrower, pinched at the waist -- never a flat-sided B; 1 a long flag and a foot; 5 a flat top over a bowl.)
  [48, "d", "M0+i,b^ L0+i,c^ L1-i,c^ L1-i,b^ Z"],
  [49, "d", "M0,c-2 L0,c-1 L.5,c L.5,b M0,b L1,b"],
  [50, "d", "M0,c L1,c~ L1,h~ L0,h~ L0,b L1,b"],
  [51, "d", "M0,c L1,c^ L1,h^ L.5,h M.5,h L1,h^ L1,b^ L0,b"],
  [52, "d", "M0,c L0,h L1,h M1,c L1,b"],
  [53, "d", "M1,c L0,c L0,.7 L1,.7~ L1,b~ L0,b"],
  [54, "d", "M1,c L0,c~ L0,b~ L1,b~ L1,h~ L0,h"],
  [55, "d", "M0,c L1,c L1,.75 L.5,.35 L.5,b"],
  [56, "d", "M0+i,h L0+i,c^ L1-i,c^ L1-i,h Z M0+i,h L0,h-1 L0,b^ L1,b^ L1,h-1 L1-i,h"],
  [57, "d", "M.5,b L1,b~ L1,c~ L0,c~ L0,h~ L1,h"],
  // Punctuation and symbols.
  [33, "i", "M0,c L0,b+2 M0,b"],
  [34, "s", "M0,c L0,c-1 M1,c L1,c-1"],
  [35, "w", "M.25,c L.25,b M.75,c L.75,b M0,.7 L1,.7 M0,.3 L1,.3"],
  [36, "n", "M1,c-1 L0,c-1~ L0,h~ L1,h~ L1,b+1~ L0,b+1 M.5,c L.5,b"],
  [37, "n", "M0,c M1,c L0,b M1,b"],
  [38, "n", "M1,b L0,.55 L0,c~ L1-1,c~ L1-1,.7 L0,.3 L0,b~ L1-1,b L1,.3"],
  [39, "i", "M0,c L0,c-1"],
  [40, "t", "M1,c L0,c-1 L0,b+1 L1,b"],
  [41, "t", "M0,c L1,c-1 L1,b+1 L0,b"],
  [42, "n", "M0,.75 L1,.25 M1,.75 L0,.25 M.5,.85 L.5,.15"],
  // (+: at least 5 wide, its arms as long as the room allows each way -- a cross, never a t without its foot.)
  [43, "o", "M0,h L1,h M.5,h+r L.5,h-r"],
  [44, "t", "M1,b L0,b-1"],
  [45, "s", "M0,h L1,h"],
  [46, "i", "M0,b"],
  [47, "n", "M1,c L0,b"],
  [58, "i", "M0,b M0,.75x"],
  [59, "t", "M1,.75x M1,b L0,b-1"],
  [60, "s", "M1,c-1 L0,h L1,b+1"],
  [61, "s", "M0,.65 L1,.65 M0,.35 L1,.35"],
  [62, "s", "M0,c-1 L1,h L0,b+1"],
  [63, "n", "M0,c L1,c~ L1,h~ L.5,h L.5,b+2 M.5,b"],
  [64, "w", "M1,.3 L1,c~ L0,c~ L0,b~ L1,b M.75,.3 L.35,.3 L.35,.7 L.75,.7 L.75,.3"],
  [91, "t", "M1,c L0,c L0,b L1,b"],
  [92, "n", "M0,c L1,b"],
  [93, "t", "M0,c L1,c L1,b L0,b"],
  [94, "s", "M0,.7 L.5,c L1,.7"],
  [95, "n", "M0,b-1 L1,b-1"],
  [96, "t", "M0,c L1,c-1"],
  [123, "s", "M1,c L.5,c~ L.5,h+1 L0,h L.5,h-1 L.5,b~ L1,b"],
  [124, "i", "M0,c L0,b-1"],
  [125, "s", "M0,c L.5,c~ L.5,h+1 L1,h L.5,h-1 L.5,b~ L0,b"],
  [126, "w", "M0,h L.25,h+1 L.5,h L.75,h-1 L1,h"],
  // The UI's own: ellipsis, bullet, multiply, divide, degree, arrows, triangles, squares, tick, heart, star.
  [8230, "w", "M0,b M.5,b M1,b"],
  [8226, "s", "FM0,h-1 L1,h-1 L1,h+1 L0,h+1 Z"],
  [215, "s", "M0,.7 L1,.3 M0,.3 L1,.7"],
  [247, "s", "M0,h L1,h M.5,h+2 M.5,h-2"],
  [176, "t", "M0,c L1,c L1,c-1 L0,c-1 Z"],
  [8592, "w", "M0,h L1,h M0+2,h+2 L0,h L0+2,h-2"],
  [8594, "w", "M0,h L1,h M1-2,h+2 L1,h L1-2,h-2"],
  [8593, "n", "M.5,c L.5,b M0,c-1 L.5,c L1,c-1"],
  [8595, "n", "M.5,c L.5,b M0,b+1 L.5,b L1,b+1"],
  [9650, "n", "FM0,.15 L.5,.85 L1,.15 Z"],
  [9660, "n", "FM0,.85 L.5,.15 L1,.85 Z"],
  [9664, "n", "FM1,.9 L0,h L1,.1 Z"],
  [9654, "n", "FM0,.9 L1,h L0,.1 Z"],
  [9632, "n", "FM0,.8 L1,.8 L1,.2 L0,.2 Z"],
  [9633, "n", "M0,.8 L1,.8 L1,.2 L0,.2 Z"],
  [10003, "n", "M0,h L.4,b+1 L1,c-1"],
  [9829, "n", "FM.5,.05 L0,.55 L0,.78 L.25,.95 L.5,.78 L.75,.95 L1,.78 L1,.55 Z"],
  [9733, "w", "FM.5,1 L.62,.62 L1,.62 L.69,.38 L.81,0 L.5,.24 L.19,0 L.31,.38 L0,.62 L.38,.62 Z"]
];
var GENERATED_CODES = [32, ...GLYPHS.map(([c]) => c)].sort((a, b) => a - b);

// packages/ui/src/theme.ts
var THEME_GENERATOR = "keel/ui/theme@1";
var CULTURES = ["industrial", "organic", "crystalline", "arcane", "brutal", "clean"];
var CORNERS = ["flat", "bevel", "inset", "notched", "rivets", "glow", "round"];
var FILLS = ["solid", "dither", "gradient", "scan"];
var MOTIONS = ["snappy", "bouncy", "none"];
var ICON_STYLES = ["solid", "outline", "duotone"];
var TONES = ["dark", "light"];
var F = DEFAULT_FONT_RANGES;
var CULTURE_SPECS = {
  industrial: {
    surfaceHue: [[[200, 245], 4], [[30, 60], 1]],
    surfaceChroma: [0.012, 0.035],
    surfaceL: [0.27, 0.35],
    accentHue: [[[55, 88], 4], [[25, 45], 2]],
    accentChroma: [0.13, 0.18],
    shift: 8,
    light: 0,
    corners: [["rivets", 4], ["bevel", 3], ["notched", 1]],
    border: [2, 2, 3],
    bevel: [1, 1, 2],
    inner: 0.5,
    fills: [["dither", 3], ["scan", 2], ["gradient", 2], ["solid", 1]],
    screens: ["diagonal", "lines", "bayer4", "hatch"],
    shadow: [1, 1, 2],
    font: { ...F, width: [0.62, 0.85], xHeight: [0.66, 0.78], round: [0, 0, 1], stroke: [0.1, 0.2], serif: [["none", 5], ["slab", 1]], slant: 0 },
    caps: 0.75,
    body: [7, 7, 8],
    ratio: [1.25, 1.5],
    unit: [2, 3],
    motion: [["snappy", 5], ["none", 1]],
    icon: [["solid", 3], ["duotone", 2]],
    iconStroke: [1, 2]
  },
  organic: {
    surfaceHue: [[[95, 155], 4], [[35, 70], 2]],
    surfaceChroma: [0.03, 0.065],
    surfaceL: [0.25, 0.33],
    accentHue: [[[65, 105], 3], [[130, 170], 2], [[330, 360], 1]],
    accentChroma: [0.12, 0.17],
    shift: 14,
    light: 0.05,
    corners: [["round", 6], ["glow", 1], ["inset", 1]],
    border: [1, 2],
    bevel: [0, 1],
    inner: 0.3,
    fills: [["dither", 3], ["gradient", 2], ["solid", 1]],
    screens: ["stipple", "halftone", "weave", "coarseDot"],
    shadow: [0, 1, 1],
    font: { ...F, width: [0.7, 0.86], round: [2, 2, 3], stroke: [0.08, 0.15], serif: [["none", 3], ["foot", 2]], slant: 0.05, tracking: [1] },
    caps: 0.2,
    body: [8, 8, 9],
    ratio: [1.3, 1.5],
    unit: [3, 4],
    motion: [["bouncy", 5], ["snappy", 2]],
    icon: [["duotone", 3], ["solid", 2]],
    iconStroke: [1]
  },
  crystalline: {
    surfaceHue: [[[190, 235], 3], [[260, 305], 2]],
    surfaceChroma: [0.035, 0.075],
    surfaceL: [0.2, 0.28],
    accentHue: [[[165, 205], 3], [[290, 330], 2]],
    accentChroma: [0.13, 0.19],
    shift: -12,
    light: 0.05,
    corners: [["notched", 6], ["glow", 2], ["bevel", 1]],
    border: [1, 1, 2],
    bevel: [1],
    inner: 0.6,
    fills: [["gradient", 3], ["dither", 2], ["solid", 1]],
    screens: ["bayer4", "bayer8", "checker", "diagonal"],
    shadow: [0, 1],
    font: { ...F, width: [0.5, 0.66], round: [0], stroke: [0.08, 0.14], serif: [["none", 1]], slant: 0.35 },
    caps: 0.6,
    body: [7, 8],
    ratio: [1.3, 1.6],
    unit: [2, 3],
    motion: [["snappy", 5], ["bouncy", 1]],
    icon: [["outline", 3], ["duotone", 2]],
    iconStroke: [1]
  },
  arcane: {
    surfaceHue: [[[270, 325], 4], [[230, 265], 2]],
    surfaceChroma: [0.045, 0.085],
    surfaceL: [0.2, 0.28],
    accentHue: [[[70, 98], 4], [[160, 195], 2]],
    accentChroma: [0.12, 0.17],
    shift: 16,
    light: 0,
    corners: [["glow", 4], ["round", 2], ["notched", 1], ["inset", 1]],
    border: [1, 2],
    bevel: [0, 1],
    inner: 0.7,
    fills: [["dither", 3], ["gradient", 2]],
    screens: ["halftone", "weave", "hatch", "coarseDot"],
    shadow: [1],
    font: { ...F, round: [1, 2], serif: [["slab", 4], ["foot", 2], ["none", 1]], slant: 0.2 },
    caps: 0.5,
    body: [7, 8],
    ratio: [1.35, 1.6],
    unit: [3, 4],
    motion: [["bouncy", 4], ["snappy", 2]],
    icon: [["duotone", 4], ["outline", 1]],
    iconStroke: [1]
  },
  brutal: {
    surfaceHue: [[[0, 35], 3], [[340, 360], 2], [[90, 120], 1]],
    surfaceChroma: [8e-3, 0.04],
    surfaceL: [0.16, 0.24],
    accentHue: [[[20, 40], 4], [[92, 112], 2]],
    accentChroma: [0.16, 0.22],
    shift: 4,
    light: 0,
    corners: [["flat", 6], ["inset", 2], ["notched", 1]],
    border: [2, 3, 3],
    bevel: [0],
    inner: 0.2,
    fills: [["solid", 3], ["scan", 2], ["dither", 1]],
    screens: ["chunky", "hatch", "lines"],
    shadow: [2, 2, 1],
    font: { ...F, width: [0.7, 0.9], stroke: [0.16, 0.25], round: [0], serif: [["none", 5], ["slab", 2]], slant: 0.1, tracking: [1] },
    caps: 0.9,
    body: [7, 8, 9],
    ratio: [1.3, 1.7],
    unit: [2, 3],
    motion: [["none", 3], ["snappy", 3]],
    icon: [["solid", 5]],
    iconStroke: [2]
  },
  clean: {
    surfaceHue: [[[215, 262], 3], [[175, 215], 2], [[0, 360], 1]],
    surfaceChroma: [8e-3, 0.03],
    surfaceL: [0.27, 0.36],
    accentHue: [[[200, 262], 3], [[140, 180], 2], [[15, 45], 1]],
    accentChroma: [0.11, 0.16],
    shift: 3,
    light: 0.2,
    corners: [["round", 4], ["flat", 3], ["bevel", 1]],
    border: [1],
    bevel: [0, 1],
    inner: 0.1,
    fills: [["solid", 5], ["gradient", 2]],
    screens: ["bayer4", "ign", "bayer8"],
    shadow: [0, 1],
    font: { ...F, width: [0.55, 0.7], round: [1], stroke: [0.08, 0.13], serif: [["none", 1]], slant: 0 },
    caps: 0.15,
    body: [7, 7, 8],
    ratio: [1.25, 1.45],
    unit: [3, 4],
    motion: [["snappy", 5], ["bouncy", 1]],
    icon: [["outline", 3], ["solid", 2]],
    iconStroke: [1]
  }
};
var wrapHue = (h) => (h % 360 + 360) % 360;
var r3 = (v) => Math.round(v * 1e3) / 1e3;
var pickRange = (S, ranges) => {
  const [a, b] = S.weighted(ranges);
  return S.between(a, b);
};
function ramp2(n, hue2, chroma, lo, hi, shift) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const L = lo + (hi - lo) * t;
    const C = chroma * (1 - 0.45 * Math.abs(t - 0.5) * 2 * (t > 0.5 ? 1 : 0.5));
    out.push(fromOklch(L, C, wrapHue(hue2 + shift * (t - 0.5) * 2)));
  }
  return out;
}
function readable(L, chroma, hue2, on, min, dir) {
  let c = fromOklch(L, chroma, hue2);
  for (let step = 0; step < 60 && on.some((s) => contrast(c, s) < min); step += 1) {
    L = Math.max(0, Math.min(1, L + dir * 0.012));
    c = fromOklch(L, chroma * (step > 30 ? 0.5 : 1), hue2);
  }
  return c;
}
function recipeKey(r) {
  const text = JSON.stringify([r.generator, r.seed, r.culture, sortPins(r.pins)]);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return `theme:${h.toString(16).padStart(8, "0")}`;
}
function sortPins(p) {
  const o = {};
  for (const k of Object.keys(p).sort()) {
    const v = p[k];
    if (v === void 0) continue;
    o[k] = v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : 1)) : v;
  }
  return o;
}
function themeResult(recipe, tone, surface, ink, accent, semantic, team, outline, accentText, hue2, accentHue, frame, type, unit2, P, drawnIcon, iconStroke, kind, overshoot) {
  return {
    recipe,
    culture: recipe.culture,
    palette: {
      tone,
      surface,
      ink,
      accent,
      good: semantic(145, 0.15),
      warn: semantic(82, 0.15),
      bad: semantic(27, 0.18),
      team,
      outline,
      onAccent: accentText,
      hues: { surface: r3(hue2), accent: r3(accentHue) }
    },
    frame,
    type,
    space: { unit: unit2, pad: unit2 + frame.border + (frame.bevel ? 1 : 0), gap: unit2 },
    icon: { style: P.icon ?? drawnIcon, stroke: iconStroke },
    motion: { kind, press: kind === "none" ? 0 : 1, ms: kind === "snappy" ? 90 : kind === "bouncy" ? 180 : 0, overshoot: kind === "bouncy" ? overshoot : 0 },
    key: recipeKey(recipe)
  };
}

function themeOf(recipe) {
  if (recipe.generator !== THEME_GENERATOR) throw new RangeError(`This is ${THEME_GENERATOR}; the recipe names ${recipe.generator}.`);
  const spec = CULTURE_SPECS[recipe.culture];
  if (!spec) throw new RangeError(`"${recipe.culture}" isn't a culture (${CULTURES.join(", ")}).`);
  const P = recipe.pins;
  const S = (name) => stream(createRoll(deriveSeed(`${recipe.seed}/${recipe.culture}`, `ui/theme/${name}`)), 0);
  const sp = S("palette");
  const drawnTone = sp.chance(spec.light) ? "light" : "dark";
  const drawnHue = pickRange(sp, spec.surfaceHue);
  const drawnChroma = sp.between(spec.surfaceChroma[0], spec.surfaceChroma[1]);
  const drawnL = sp.between(spec.surfaceL[0], spec.surfaceL[1]);
  const drawnAccent = pickRange(sp, spec.accentHue);
  const accentChroma = sp.between(spec.accentChroma[0], spec.accentChroma[1]);
  const semanticNudge = sp.between(-8, 8);
  const teamStart = sp.between(0, 360);
  const tone = P.tone ?? drawnTone;
  const hue2 = wrapHue(P.hue ?? drawnHue);
  const chroma = P.chroma ?? drawnChroma;
  const accentHue = wrapHue(P.accentHue ?? drawnAccent);
  const shift = spec.shift;
  const dark = tone === "dark";
  const base = dark ? drawnL : 0.9 - (drawnL - 0.25) * 0.4;
  const surface = dark ? ramp2(6, hue2, chroma, Math.max(0.06, base - 0.15), Math.min(0.72, base + 0.27), shift).map((c, i) => i === 2 ? fromOklch(base, chroma, hue2) : c) : ramp2(6, hue2, chroma * 0.8, 0.58, 0.99, shift).map((c, i) => i === 2 ? fromOklch(base, chroma * 0.6, hue2) : c);
  const panels = [surface[1], surface[2], surface[3]];
  const ink = dark ? [readable(0.74, 0.025, hue2, panels, 4.6, 1), readable(0.9, 0.02, hue2, panels, 5.5, 1), readable(0.97, 0.015, hue2, panels, 7, 1)] : [readable(0.46, 0.03, hue2, panels, 4.6, -1), readable(0.28, 0.03, hue2, panels, 6, -1), readable(0.16, 0.03, hue2, panels, 8, -1)];
  const accent = ramp2(5, accentHue, accentChroma, 0.36, 0.9, shift * 0.6);
  const semantic = (h, c) => ramp2(5, h + semanticNudge, c, 0.36, 0.9, shift * 0.4);
  const teams = Math.max(1, Math.min(24, P.teams ?? 8));
  const team = [];
  for (let i = 0; i < teams; i += 1) {
    const th = P.teamHues?.[i] ?? wrapHue(teamStart + i * 137.508);
    const lift = teams > 12 && i % 2 ? 0.08 : 0;
    team.push(ramp2(5, th, 0.16, 0.38 + lift, 0.9, 6));
  }
  const labels = [ink[2], surface[0], fromOklch(0.99, 0.01, accentHue), fromOklch(0.14, 0.02, accentHue)];
  const accentText = labels.reduce((b, c) => contrast(c, accent[1]) > contrast(b, accent[1]) ? c : b);
  const fr = S("frame");
  const drawn = {
    corner: fr.weighted(spec.corners),
    border: fr.pick(spec.border),
    bevel: fr.pick(spec.bevel),
    inner: fr.chance(spec.inner),
    fill: fr.weighted(spec.fills),
    screen: fr.pick(spec.screens),
    shadow: fr.pick(spec.shadow),
    radius: fr.int(2, 4),
    rivets: fr.pick([0, 12, 16, 24])
  };
  const corner = P.corner ?? drawn.corner;
  const frame = {
    corner,
    radius: P.radius ?? (corner === "notched" ? Math.min(drawn.radius, 3) : drawn.radius),
    border: Math.max(1, Math.min(3, P.border ?? drawn.border)),
    bevel: P.bevel ?? (corner === "bevel" || corner === "rivets" ? Math.max(1, drawn.bevel) : drawn.bevel),
    inner: drawn.inner,
    shadow: P.shadow ?? drawn.shadow,
    glow: P.glow ?? (corner === "glow" ? 2 : 0),
    fill: P.fill ?? drawn.fill,
    screen: P.screen && SCREEN_IDS.includes(P.screen) ? P.screen : drawn.screen,
    rivets: corner === "rivets" ? drawn.rivets || 16 : 0
  };
  const outline = corner === "glow" ? accent[0] : dark ? surface[0] : fromOklch(0.3, chroma, hue2);
  const ty = S("type");
  const font = fontParamsOf(ty, spec.font, P.font);
  const drawnBody = ty.pick(spec.body);
  const ratio = ty.between(spec.ratio[0], spec.ratio[1]);
  const drawnCaps = ty.chance(spec.caps);
  const body = Math.max(5, Math.min(12, P.body ?? drawnBody));
  const title = Math.min(16, Math.max(body + 2, Math.round(body * ratio)));
  const type = { small: Math.max(5, body - 2), body, title, display: Math.min(16, Math.max(title + 2, Math.round(title * ratio))), font, caps: P.caps ?? drawnCaps };
  const mo = S("motion");
  const drawnUnit = mo.pick(spec.unit);
  const drawnMotion = mo.weighted(spec.motion);
  const drawnIcon = mo.weighted(spec.icon);
  const iconStroke = mo.pick(spec.iconStroke);
  const overshoot = r3(mo.between(0.15, 0.35));
  const unit2 = P.unit ?? drawnUnit;
  const kind = P.motion ?? drawnMotion;
  return themeResult(recipe, tone, surface, ink, accent, semantic, team, outline, accentText, hue2, accentHue, frame, type, unit2, P, drawnIcon, iconStroke, kind, overshoot);
}

// packages/ui/src/frames.ts
var FRAME_KINDS = ["panel", "button", "inset", "tooltip", "badge", "tab", "header"];

// packages/ui/src/icons.ts
var poly = (...pts) => pts.flatMap(([x, y]) => [x, y]);
var rect = (x0, y0, x1, y1) => poly([x0, y0], [x1, y0], [x1, y1], [x0, y1]);
var disc = (cx, cy, r, ry = r) => ellipse(cx, cy, r, ry, 40);
function seg(x0, y0, x1, y1, w) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l * (w / 2), ny = dx / l * (w / 2);
  return poly([x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]);
}
var strokes = (pts, w, closed = false) => {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i += 1) {
    const a = pts[i], b = pts[(i + 1) % n];
    out.push(seg(a[0], a[1], b[0], b[1], w));
  }
  for (const p of pts) out.push(disc(p[0], p[1], w / 2));
  return out;
};
function star(cx, cy, r0, r1, n, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n * 2; i += 1) {
    const a = rot + i * Math.PI / n;
    const r = i % 2 ? r1 : r0;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return poly(...pts);
}
function gear(cx, cy, r, teeth, depth) {
  const pts = [];
  const steps = teeth * 4;
  for (let i = 0; i < steps; i += 1) {
    const a = i / steps * Math.PI * 2;
    const rr = i % 4 < 2 ? r : r - depth;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return poly(...pts);
}
var arrowHead = (tipX, tipY, dirX, dirY, size3) => {
  const l = Math.hypot(dirX, dirY) || 1, ux = dirX / l, uy = dirY / l;
  return poly([tipX, tipY], [tipX - ux * size3 - uy * size3 * 0.8, tipY - uy * size3 + ux * size3 * 0.8], [tipX - ux * size3 + uy * size3 * 0.8, tipY - uy * size3 - ux * size3 * 0.8]);
};
var add2 = (...shape) => ({ shape });
var cut = (...shape) => ({ cut: true, shape });
var mirror = (ops) => ops.map((o) => ({ ...o, shape: o.shape.map((c) => c.map((v, i) => i % 2 ? v : 1 - v)) }));
function sword(S, w, flip) {
  const len2 = S.between(0.62, 0.78);
  const bw = w * S.between(1.2, 1.6);
  const tip = [0.86, 0.14];
  const hilt = [tip[0] - len2 * 0.7071, tip[1] + len2 * 0.7071];
  const guard = S.between(0.14, 0.22);
  const ops = [
    add2(seg(hilt[0], hilt[1], tip[0] - 0.03, tip[1] + 0.03, bw), poly([tip[0], tip[1]], [tip[0] - 0.12, tip[1] + 0.03], [tip[0] - 0.03, tip[1] + 0.12])),
    add2(seg(hilt[0] - guard * 0.7071, hilt[1] - guard * 0.7071, hilt[0] + guard * 0.7071, hilt[1] + guard * 0.7071, w * 1.3)),
    add2(seg(hilt[0], hilt[1], hilt[0] - 0.16, hilt[1] + 0.16, w * 1.1), disc(hilt[0] - 0.18, hilt[1] + 0.18, w * 0.9))
  ];
  return flip ? mirror(ops) : ops;
}

export {
  CORNERS,
  CULTURES,
  FILLS,
  FRAME_KINDS,
  ICON_STYLES,
  MOTIONS,
  THEME_GENERATOR,
  TONES,
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
  themeOf,
};
