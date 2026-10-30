// ../../../../../../keel-engine/packages/core/src/dmath.ts
var F64 = new Float64Array(1);
var U32 = new Uint32Array(F64.buffer);
F64[0] = 1;
var HI = U32[1] === 1072693248 ? 1 : 0;
var LO = 1 - HI;
function dhypot(a, b, c) {
  const x = Math.abs(a);
  const y = Math.abs(b);
  const three = c !== void 0;
  const z = three ? Math.abs(c) : 0;
  if (x === Infinity || y === Infinity || z === Infinity) return Infinity;
  if (x !== x || y !== y || z !== z) return NaN;
  let max = x > y ? x : y;
  if (z > max) max = z;
  if (max === 0) return 0;
  let n = x / max;
  let sum = n * n;
  let comp = 0;
  n = y / max;
  let summand = n * n - comp;
  let pre = sum + summand;
  comp = pre - sum - summand;
  sum = pre;
  if (three) {
    n = z / max;
    summand = n * n - comp;
    pre = sum + summand;
    sum = pre;
  }
  return Math.sqrt(sum) * max;
}

// ../../../../../../keel-engine/packages/core/src/frame.ts
var FRONT = Object.freeze([0, 0, 1]);
var RIGHT = Object.freeze([1, 0, 0]);
var UP = Object.freeze([0, 1, 0]);
function cameraBasis(eye, target) {
  let f = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
  const fl = dhypot(f[0], f[1], f[2]) || 1;
  f = [f[0] / fl, f[1] / fl, f[2] / fl];
  let r = [f[2], 0, -f[0]];
  const rl = dhypot(r[0], r[1], r[2]) || 1;
  r = rl < 1e-6 ? [1, 0, 0] : [r[0] / rl, r[1] / rl, r[2] / rl];
  const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
  return { forward: f, right: r, up: u };
}

// ../../../../../../keel-engine/packages/core/src/math.ts
var TAU = Math.PI * 2;
var fract = (v) => v - Math.floor(v);
var tri = (v) => 1 - Math.abs(2 * fract(v) - 1);

// ../../../../../../keel-engine/packages/core/src/curl.ts
var FLOW_PERIOD = 4096;
var FLOW_SPEED = 0.35;
var FLOW_R = FLOW_PERIOD * FLOW_SPEED / (2 * Math.PI);
var W = new Float64Array(8);
var IO = new Float64Array(7);
var CURL_GLSL = `
float curlLat(ivec3 i, uint s) {
  uint h = (uint(i.x) * 0x8da6b343u) ^ (uint(i.y) * 0xd8163841u) ^ (uint(i.z) * 0xcb1ab31fu) ^ s;
  h ^= h >> 16; h *= 0x7feb352du; h ^= h >> 15; h *= 0x846ca68bu; h ^= h >> 16;
  return float(h) / 2147483647.5 - 1.0;
}
vec3 curlGrad(vec3 x, uint s) {
  vec3 fi = floor(x); ivec3 i = ivec3(fi); vec3 f = x - fi;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec3 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = curlLat(i, s), b = curlLat(i + ivec3(1, 0, 0), s), c = curlLat(i + ivec3(0, 1, 0), s), d = curlLat(i + ivec3(1, 1, 0), s);
  float e = curlLat(i + ivec3(0, 0, 1), s), ff = curlLat(i + ivec3(1, 0, 1), s), g = curlLat(i + ivec3(0, 1, 1), s), h = curlLat(i + ivec3(1, 1, 1), s);
  float k1 = b - a, k2 = c - a, k3 = e - a, k4 = a - b - c + d, k5 = a - c - e + g, k6 = a - b - e + ff, k7 = -a + b + c - d + e - ff - g + h;
  return du * vec3(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z, k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x, k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y);
}
vec3 curlNoiseN(vec3 p, float t, int octaves) {
  float th = t / ${FLOW_PERIOD.toFixed(1)} * 6.283185307;
  p += vec3(${FLOW_R.toFixed(4)} * cos(th), 0.0, ${FLOW_R.toFixed(4)} * sin(th));
  vec3 a = vec3(0.0), b = vec3(0.0);
  float f = 1.0, w = 1.0;
  for (int k = 0; k < 2; k++) {
    if (k >= octaves) break;
    a += curlGrad(p * f, 0x2545f491u + uint(k)) * f * w;
    b += curlGrad(p * f + vec3(31.4, 17.7, 5.9), 0x68e31da4u + uint(k)) * f * w;
    f *= 2.03; w *= 0.5;
  }
  return cross(a, b) * 0.25;
}
vec3 curlNoise(vec3 p, float t) { return curlNoiseN(p, t, 2); }`;

// ../../../../../../keel-engine/packages/core/src/palette.ts
function ramp(S, hues, extra = {}) {
  return {
    hues,
    chroma: S.between(0.11, 0.19),
    lift: S.between(0.04, 0.09),
    top: S.between(0.94, 0.985),
    gamma: S.between(1, 1.35),
    shift: S.between(6, 20),
    ...extra
  };
}
var accentRamp = (S, hue, extra = {}) => ({
  hues: [hue - 6, hue + 6],
  chroma: S.between(0.15, 0.23),
  lift: 0.32,
  top: 0.96,
  gamma: 0.9,
  shift: 4,
  ...extra
});
var SCHEMES = [
  ["Monochrome", 3, (S, h) => ({
    key: ramp(S, [h - 4, h + 4]),
    accent: accentRamp(S, h + S.between(-10, 10), { chroma: S.between(0.18, 0.25) })
  })],
  ["Nocturne", 9, (S, h) => ({
    key: ramp(S, [h - 9, h + 9]),
    accent: accentRamp(S, h + 180 + S.between(-35, 35))
  })],
  ["Duotone", 5, (S, h) => {
    const d = S.pick([-1, 1]) * S.between(45, 85);
    return { key: ramp(S, [h - d / 2, h + d / 2]), accent: accentRamp(S, h + 180 + S.between(-25, 25)) };
  }],
  ["Split", 3, (S, h) => ({
    key: ramp(S, [h - 12, h + 12]),
    accent: accentRamp(S, h + S.pick([-1, 1]) * S.between(125, 155))
  })],
  ["Triad", 3, (S, h) => {
    const dir = S.pick([-1, 1]);
    return { key: ramp(S, [h, h + dir * 120]), accent: accentRamp(S, h - dir * 120 + S.between(-15, 15)) };
  }],
  ["Two Worlds", 7.5, (S, h) => {
    const inside = h + 180 + S.between(-40, 40);
    return {
      outside: ramp(S, [h - 10, h + 10], { chroma: S.between(0.12, 0.2), top: 0.9 }),
      key: ramp(S, [inside - 12, inside + 12]),
      accent: accentRamp(S, inside + S.pick([-1, 1]) * S.between(25, 60))
    };
  }],
  ["Neon Noir", 2, (S, h) => ({
    // Near-neutral room, one vivid ink. Contrast by placement, not by volume.
    key: ramp(S, [h - 5, h + 5], { chroma: S.between(0.025, 0.05), shift: 4 }),
    accent: accentRamp(S, h + S.pick([0, 150, 180, 210]), { chroma: 0.3, lift: 0.4 })
  })],
  ["Spectrum", 1.5, (S, h) => {
    const span = S.pick([-1, 1]) * S.between(150, 220);
    return {
      key: ramp(S, [h, h + span / 3, h + span * 2 / 3, h + span], { chroma: S.between(0.13, 0.18) }),
      accent: accentRamp(S, h + span / 2 + 180)
    };
  }],
  ["Prism", 0.6, (S, h) => ({
    key: ramp(S, [h, h + 90, h + 180, h + 270, h + 360], { chroma: S.between(0.13, 0.17), shift: 0 }),
    accent: accentRamp(S, h + 45, { chroma: 0.12 })
  })]
];
var SCHEME_NAMES = SCHEMES.map(([n]) => n);

// ../../../../../../keel-engine/packages/core/src/look.ts
var DRAWS = new Float64Array(16);
var WEIGHTS = [1, 0.8, 0.5];
var W_NORM = Math.sqrt(WEIGHTS.reduce((a, b) => a + b, 0));

// ../../../../../../keel-engine/packages/core/src/dither.ts
var BAYER2 = [0, 2, 3, 1];
var BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
var BAYER8 = (() => {
  const out = new Array(64);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const q = BAYER4[(y & 3) * 4 + (x & 3)];
      const b = BAYER2[(y >> 2) * 2 + (x >> 2)];
      out[y * 8 + x] = q * 4 + b;
    }
  }
  return out;
})();
var b2 = (i) => BAYER2[i];
var b4 = (i) => BAYER4[i];
var b8 = (i) => BAYER8[i];
function equalize(shape, w, h, tie = (x, y) => b8((y & 7) * 8 + (x & 7))) {
  const cells = [];
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) cells.push([Math.round(shape(x, y) * 1e6), tie(x, y), y * w + x]);
  cells.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const table = new Float32Array(w * h);
  cells.forEach(([, , k], rank) => {
    table[k] = (rank + 0.5) / cells.length;
  });
  return (x, y) => table[(y % h + h) % h * w + (x % w + w) % w];
}
var ALONG = [0, 4, 2, 6, 1, 5, 3, 7];
var along = (x) => ALONG[x & 7];
function dotScreen([ax, ay], [bx, by], w, h) {
  const det = ax * by - ay * bx;
  const coords = (x, y) => [(x * by - y * bx) / det, (y * ax - x * ay) / det];
  const shape = (x, y) => {
    const [u, v] = coords(x, y);
    return -(Math.cos(2 * Math.PI * u) + Math.cos(2 * Math.PI * v));
  };
  const tie = (x, y) => {
    const [u, v] = coords(x, y);
    const [i, j] = [Math.round(u), Math.round(v)];
    const dx = x - (i * ax + j * bx);
    const dy = y - (i * ay + j * by);
    const oct = Math.floor((Math.atan2(dy, dx) + 2 * Math.PI) % (2 * Math.PI) / (Math.PI / 4) + 1e-9) & 7;
    return ALONG[oct];
  };
  return equalize(shape, w, h, tie);
}
var BLUE_NOISE = (() => {
  const s = atob("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");
  const t = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) t[i] = s.charCodeAt(i);
  return t;
})();
var SCREENS = {
  bayer2: { name: "Bayer 2", at: (x, y) => (b2((y & 1) * 2 + (x & 1)) + 0.5) / 4 },
  bayer4: { name: "Bayer 4", at: (x, y) => (b4((y & 3) * 4 + (x & 3)) + 0.5) / 16 },
  bayer8: { name: "Bayer 8", at: (x, y) => (b8((y & 7) * 8 + (x & 7)) + 0.5) / 64 },
  chunky: { name: "Chunky", at: (x, y) => (b4((y >> 1 & 3) * 4 + (x >> 1 & 3)) + 0.5) / 16 },
  // (As fine as the old screen: a dot every 18 pixels, now truly at 45°.)
  halftone: { name: "Halftone", at: dotScreen([3, 3], [3, -3], 6, 6) },
  // (The coarse dot keeps its nine flat levels for now: equalized, at 26.6°
  // or square, its dots read as blotches to every critic. The owner's call.)
  coarseDot: { name: "Coarse Dot", at: (x, y) => (Math.cos((x + y) / 6 * Math.PI) * Math.cos((x - y) / 6 * Math.PI) + 1) * 0.5 },
  // (Line screen, crosshatch, checker and weave keep their few flat levels
  // for now: equalized, a night sky's gradient turns to dashes, hatching lies
  // across the objects and a checker becomes a lattice of specks -- and blind
  // critics preferred the flat fills every time. The owner's call.)
  lines: { name: "Line Screen", at: (x, y) => tri(y / 3 + 0.5) * 0.9 + b2((y & 1) * 2 + (x & 1)) / 4 * 0.1 },
  diagonal: { name: "Diagonal", at: equalize((x, y) => [3, 1, 0, 2][x + y & 3], 8, 8, (x, y) => along(x + 4 * (x + y >> 2))) },
  hatch: { name: "Crosshatch", at: (x, y) => (tri((x + y) / 4) + tri((x - y) / 4)) * 0.5 },
  stipple: { name: "Stipple", at: (x, y) => (BLUE_NOISE[(y & 63) * 64 + (x & 63)] + 0.5) / 256 },
  ign: { name: "Interleaved", at: (x, y) => fract(52.9829189 * fract(0.06711056 * x + 583715e-8 * y)) },
  checker: { name: "Checker", at: (x, y) => x + y & 1 ? 0.3 : 0.7 },
  weave: { name: "Weave", at: (x, y) => ((x >> 1) + (y >> 1) & 1 ? tri(x / 4) : tri(y / 4)) * 0.94 + 0.03 }
};
var SCREEN_IDS = Object.keys(SCREENS);
function measureScreen(at, T = 24) {
  const vals = [];
  for (let y = 0; y < T; y += 1) for (let x = 0; x < T; x += 1) vals.push(at(x, y));
  const levels = new Set(vals.map((v) => v.toFixed(4))).size;
  const bins = new Array(16).fill(0);
  for (const v of vals) {
    const b = Math.min(15, Math.floor(v * 16));
    bins[b] = bins[b] + 1;
  }
  const maxBin = Math.max(...bins) / vals.length;
  const mean = vals.reduce((a, v) => a + v, 0) / vals.length;
  const varr = vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length || 1;
  const corr = (dx, dy) => {
    let acc = 0;
    let n = 0;
    for (let y = 0; y < T - 8; y += 1) for (let x = 8; x < T - 8; x += 1) {
      acc += (at(x, y) - mean) * (at(x + dx, y + dy) - mean);
      n += 1;
    }
    return acc / n / varr;
  };
  const shifts = [];
  for (let dy = 0; dy <= 8; dy += 1) for (let dx = -8; dx <= 8; dx += 1) if (dy > 0 || dx > 0) shifts.push({ r: corr(dx, dy), dx, dy });
  const rMax = Math.max(...shifts.map((s) => s.r));
  const best = shifts.filter((s) => s.r > rMax - 0.02).sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy))[0];
  const angle = (Math.atan2(best.dy, best.dx) * 180 / Math.PI + 180) % 180;
  const unit = [[0, 1, 0], [45, 1, 1], [90, 0, 1], [135, -1, 1]].map(([a, dx, dy]) => [a, corr(dx, dy)]);
  const top = Math.max(...unit.map(([, r]) => r));
  return {
    levels,
    maxBin,
    period: +Math.hypot(best.dx, best.dy).toFixed(2),
    angle: +angle.toFixed(1),
    r: +best.r.toFixed(2),
    // (Every direction within a hair of the smoothest counts: a crosshatch runs both diagonals.)
    lines: unit.filter(([, r]) => r > top - 0.02).map(([a]) => a)
  };
}
var SCREEN_GEOM = Object.fromEntries(SCREEN_IDS.map((id) => {
  const m = measureScreen(SCREENS[id].at);
  return [id, { period: m.period, angle: m.angle, r: m.r, lines: m.lines }];
}));
var SCREEN_KIND = {
  bayer2: ["ordered", 1, "grid"],
  bayer4: ["ordered", 1, "grid"],
  bayer8: ["ordered", 1, "grid"],
  chunky: ["ordered", 3, "grid"],
  halftone: ["dot", 2, "diag"],
  coarseDot: ["dot", 3, "grid"],
  lines: ["line", 2, "h"],
  diagonal: ["line", 2, "d"],
  hatch: ["line", 2, "x"],
  stipple: ["noise", 1, "none"],
  ign: ["noise", 1, "ign"],
  checker: ["pattern", 3, "diag"],
  weave: ["pattern", 3, "grid"]
};
var TARGET_BANDS = [["tiny", 48], ["small", 128], ["large", Infinity]];
var TARGET_SCREENS = {
  ordered: { tiny: "bayer2", small: "bayer4", large: "bayer8" },
  dot: { tiny: "bayer2", small: "halftone", large: "halftone" },
  line: { tiny: "bayer2", small: "lines", large: "hatch" },
  noise: { tiny: "ign", small: "stipple", large: "stipple" },
  pattern: { tiny: "checker", small: "bayer4", large: "weave" }
};
var TARGET_STEPS = { tiny: 3, small: 5, large: 7 };
var SCREEN_MIN_BAND = {
  bayer2: "tiny",
  checker: "tiny",
  ign: "tiny",
  bayer4: "small",
  halftone: "small",
  lines: "small",
  diagonal: "small",
  stipple: "small",
  bayer8: "large",
  chunky: "large",
  coarseDot: "large",
  hatch: "large",
  weave: "large"
};
var BAND_ORDER = { tiny: 0, small: 1, large: 2 };
function bandOf(width, height = width) {
  const side = Math.min(width, height);
  for (const [band, max] of TARGET_BANDS) if (side <= max) return band;
  return "large";
}
function screenForTarget(width, height = width, preference = "ordered") {
  const band = bandOf(width, height);
  let family;
  let id;
  if (SCREENS[preference]) {
    const pref = preference;
    family = SCREEN_KIND[pref][0];
    id = BAND_ORDER[SCREEN_MIN_BAND[pref]] <= BAND_ORDER[band] ? pref : TARGET_SCREENS[family][band];
  } else if (TARGET_SCREENS[preference]) {
    family = preference;
    id = TARGET_SCREENS[family][band];
  } else {
    throw new RangeError(`Unknown screen or family: ${preference}`);
  }
  return { id, steps: TARGET_STEPS[band], bias: 0, family, band };
}

// ../../../../../../keel-engine/packages/core/src/quantize.ts
var BAYER4Q = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

// ../../../../../../keel-engine/packages/core/src/gif.ts
var DICT = new Int32Array(1 << 17).fill(-1);
var DICT_TOUCHED = new Int32Array(1 << 12);

// ../../../../../../keel-engine/packages/core/src/targets.ts
var preset = (id, label, kind, width, height, paletteLimit, channelBits, screen, hardware = null) => Object.freeze({ id, label, kind, width, height, paletteLimit, channelBits, screen, dither: screen ? 0.9 : 0, hardware });
var TARGET_PROFILES = Object.freeze({
  native: preset("native", "Original", "native", 128, 128, 65536, 8, 4),
  "8-bit": preset("8-bit", "8-bit style", "style", 256, 240, 16, 8, 2),
  "16-bit": preset("16-bit", "16-bit style", "style", 320, 240, 256, 5, 4),
  "32-bit": preset("32-bit", "32-bit style", "style", 512, 384, 32768, 5, 4),
  "64-bit": preset("64-bit", "64-bit style", "style", 640, 480, 65536, 8, 8),
  "game-boy": preset("game-boy", "Game Boy", "hardware", 160, 144, 4, 8, 2, "game-boy"),
  "game-boy-color": preset("game-boy-color", "Game Boy Color", "hardware", 160, 144, 32, 5, 2, "game-boy-color"),
  chromatic: preset("chromatic", "ModRetro Chromatic", "hardware", 160, 144, 32, 5, 2, "game-boy-color")
});
function targetProfile(input) {
  const id = typeof input === "number" ? `${input}-bit` : input;
  if (!Object.hasOwn(TARGET_PROFILES, id)) throw new RangeError(`Unknown target: ${id}`);
  return TARGET_PROFILES[id];
}
var byte = (n) => {
  if (!Number.isFinite(n)) throw new RangeError("Colour channels must be finite");
  return Math.max(0, Math.min(255, Math.round(n)));
};
var colour = (c) => [byte(c[0] ?? 0), byte(c[1] ?? 0), byte(c[2] ?? 0)];
var key = (c) => c[0] << 16 | c[1] << 8 | c[2];
var light = (c) => c[0] * 299 + c[1] * 587 + c[2] * 114;
function rgb555(c) {
  const [r, g, b] = colour(c).map((v) => Math.round(v * 31 / 255));
  return r | g << 5 | b << 10;
}
function fromRgb555(word) {
  return [Math.round((word & 31) * 255 / 31), Math.round((word >> 5 & 31) * 255 / 31), Math.round((word >> 10 & 31) * 255 / 31)];
}
function nearestColour(c, palette) {
  if (!palette.length) throw new RangeError("A palette must contain a colour");
  let best = 0, distance = Infinity;
  for (let i = 0; i < palette.length; i += 1) {
    const p = palette[i];
    const d = (c[0] - p[0]) ** 2 * 299 + (c[1] - p[1]) ** 2 * 587 + (c[2] - p[2]) ** 2 * 114;
    if (d < distance) {
      distance = d;
      best = i;
    }
  }
  return best;
}
function box(samples) {
  let axis = 0, range = -1;
  for (let a = 0; a < 3; a += 1) {
    let lo = 255, hi = 0;
    for (const s of samples) {
      lo = Math.min(lo, s.c[a]);
      hi = Math.max(hi, s.c[a]);
    }
    if (hi - lo > range) {
      axis = a;
      range = hi - lo;
    }
  }
  return { samples, axis, score: samples.length > 1 ? range * samples.reduce((n, s) => n + s.count, 0) : -1 };
}
function reduceColours(input, limit) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("Palette limit must be a positive integer");
  const histogram = /* @__PURE__ */ new Map();
  for (const raw of input) {
    const c = colour(raw), k = key(c), old = histogram.get(k);
    if (old) old.count += 1;
    else histogram.set(k, { c, count: 1 });
  }
  const samples = [...histogram.values()].sort((a, b) => key(a.c) - key(b.c));
  if (samples.length <= limit) return samples.map((s) => [...s.c]);
  const boxes = [box(samples)];
  while (boxes.length < limit) {
    let selected = 0;
    for (let i = 1; i < boxes.length; i += 1) if (boxes[i].score > boxes[selected].score) selected = i;
    const b = boxes[selected];
    if (b.score < 0) break;
    b.samples.sort((a, z) => a.c[b.axis] - z.c[b.axis] || key(a.c) - key(z.c));
    const half = b.samples.reduce((n, s) => n + s.count, 0) / 2;
    let total = 0, split = 0;
    do {
      total += b.samples[split++].count;
    } while (total < half && split < b.samples.length - 1);
    boxes.splice(selected, 1, box(b.samples.slice(0, split)), box(b.samples.slice(split)));
  }
  return boxes.map((b) => {
    const weight = b.samples.reduce((n, s) => n + s.count, 0);
    const mean = [0, 0, 0];
    for (const s of b.samples) for (let a = 0; a < 3; a += 1) mean[a] = mean[a] + s.c[a] * s.count / weight;
    return [...b.samples[nearestColour(mean, b.samples.map((s) => s.c))].c];
  }).sort((a, b) => light(a) - light(b) || key(a) - key(b));
}
function adaptTargetPalette(input, target) {
  const profile2 = targetProfile(target);
  const colours = input.map((c) => {
    const rgb = colour(c);
    if (profile2.hardware === "game-boy") {
      const v = Math.round(light(rgb) / 85e3) * 85;
      return [v, v, v];
    }
    return profile2.channelBits === 5 ? fromRgb555(rgb555(rgb)) : rgb;
  });
  const palette = reduceColours(colours, profile2.paletteLimit);
  const cache = new Map(palette.map((c) => [key(c), c]));
  return colours.map((c) => {
    const k = key(c);
    let found = cache.get(k);
    if (!found) {
      found = palette[nearestColour(c, palette)];
      cache.set(k, found);
    }
    return [...found];
  });
}

// ../../../../../../keel-engine/packages/render/src/fx.ts
var FX_ORDER = ["crt", "grade", "fog", "glow", "rim", "flash", "vignette", "scanlines", "dither", "outline", "cycle"];
var scalePx = (v, side, min = 1, max = 64) => Math.max(min, Math.min(max, Math.round(v * side / 128)));
var GRADE_PRESETS = { day: { shift: 0 }, dusk: { shift: -0.6 }, night: { shift: -1.4 } };
var FX = {
  // A tube's bend: whole pixels moved outward from the middle, the corners gone to a border entry. (From 64 px.)
  crt: { defaults: { curve: 0.08, border: { ramp: 0, index: 0 }, minSize: 64 }, resolve: (p, side) => side < p.minSize ? { off: `below ${p.minSize} px` } : { curve: p.curve, border: p.border } },
  // Colour grading by ramps: each ramp swapped for its graded twin (map: { stone: "stoneNight" }), then shifted along it.
  grade: {
    defaults: { preset: "day", shift: null, map: {} },
    resolve: (p) => ({ shift: p.shift ?? (Object.hasOwn(GRADE_PRESETS, p.preset) ? GRADE_PRESETS[p.preset] : GRADE_PRESETS.day).shift, map: { ...p.map } })
  },
  // Fog by distance: past `near`, pixels go over to the fog ramp -- dithered, by the screen -- all of them by `far`.
  fog: { defaults: { ramp: "sky", near: 25, far: 90, amount: 1, light: 0.3 }, resolve: (p) => ({ ...p }) },
  // Glow: emissive materials (glow >= threshold) climb `self` entries; round them a halo `radius` px (at 128) climbs `halo`.
  glow: {
    defaults: { radius: 3, halo: 2.5, self: 1, threshold: 0.2, tint: false },
    resolve: (p, side) => ({ ...p, radius: scalePx(p.radius, side, 1, 16) })
  },
  // Rim light: an edge on the light's side (`dir`: "sun" or a screen direction [x, y]) climbs `steps`; `width` px at 128.
  rim: { defaults: { width: 1, steps: 1.5, dir: "sun" }, resolve: (p, side) => ({ ...p, width: scalePx(p.width, side, 1, 4) }) },
  // Hit flash: the struck thing -- by material (`mats`) or id range (`ids: [from, to]`) -- goes up by `amount` (0..1), or onto `ramp`.
  flash: { defaults: { amount: 0, mats: [], ids: null, ramp: null }, resolve: (p) => ({ ...p, amount: Math.max(0, Math.min(1, p.amount)), mats: p.mats.slice(0, 8) }) },
  // Vignette: from `inner` to `outer` (fractions of the half-diagonal), `steps` down the ramps, dithered.
  vignette: { defaults: { inner: 0.55, outer: 1.1, steps: 2 }, resolve: (p) => ({ ...p }) },
  // Scanlines: `dark` rows of every `period` (px at 128) a step down. Only from `minSize` px: below it they are the picture.
  scanlines: {
    defaults: { period: 2, steps: 1, minSize: 96 },
    resolve: (p, side) => {
      if (side < p.minSize) return { off: `below ${p.minSize} px` };
      const period = Math.max(2, scalePx(p.period, side, 2, 16));
      return { period, dark: Math.max(1, Math.floor(period / 2)), steps: p.steps };
    }
  },
  // The dither screen: a core screen id or family ("ordered", "dot", "line", "noise", "pattern"), or "auto"; `amount` 0..1.
  dither: {
    defaults: { screen: "auto", amount: 0.9 },
    resolve: (p, _side, W2, H) => {
      if (p.screen === "none" || p.amount <= 0) return { screen: "none", amount: 0 };
      const pref = p.screen === "auto" ? "ordered" : p.screen;
      return { screen: screenForTarget(W2, H, pref).id, amount: p.amount };
    }
  },
  // The outline: "all" (a thing against anything behind it -- the classic), "outer" (only across `gap` metres:
  // silhouettes, not the parts inside them), "none"; `steps` darker, or in one `color` { ramp, index }.
  outline: {
    defaults: { mode: "all", steps: 3, gap: 1.5, color: null },
    resolve: (p) => p.mode === "none" ? { off: "mode none" } : { mode: p.mode, steps: p.steps, gap: p.mode === "outer" ? p.gap : 0.56, color: p.color }
  },
  // Palette cycling: named ramps' upper entries (from `from`, a fraction of the ramp) turn over at `speed` entries a second.
  cycle: {
    defaults: { ramps: {}, speed: 3, from: 0.5 },
    resolve: (p) => {
      const list = isList(p.ramps) ? Object.fromEntries(p.ramps.map((r) => [r, {}])) : p.ramps;
      return { ramps: Object.fromEntries(Object.entries(list).map(([r, o]) => [r, { speed: o.speed ?? p.speed, from: o.from ?? p.from }])) };
    }
  }
};
var isList = (v) => Array.isArray(v);
var FX_NAMES = Object.keys(FX);
var known = (name) => typeof name === "string" && Object.hasOwn(FX, name);
var dims = (target) => {
  if (typeof target === "number") return [target, target];
  if ("width" in target) return [target.width, target.height];
  return [target[0], target[1]];
};
function resolveFx(list = [], target = 128) {
  const [W2, H] = dims(target);
  const side = Math.min(W2, H);
  const byName = /* @__PURE__ */ new Map();
  for (const e of list) {
    if (!e || !known(e.name)) throw new RangeError(`Unknown fx pass: ${String(e?.name)}`);
    byName.set(e.name, { ...byName.get(e.name) ?? {}, ...e });
  }
  const out = [];
  for (const name of FX_ORDER) {
    const entry = byName.get(name);
    if (!entry) continue;
    const { name: _, on = true, ...given } = entry;
    out.push(resolveOne(name, Boolean(on), given, side, W2, H));
  }
  return out;
}
function resolveOne(name, on, given, side, W2, H) {
  const def = FX[name];
  const params = { ...def.defaults, ...given };
  if (!on) return { name, on: false, params, note: "turned off" };
  const r = def.resolve(params, side, W2, H);
  if ("off" in r && r.off) return { name, on: false, params, note: r.off };
  return { name, on: true, params: r };
}
function toggleFx(list, name, on) {
  if (!known(name)) throw new RangeError(`Unknown fx pass: ${String(name)}`);
  const has = list.some((e) => e.name === name);
  return has ? list.map((e) => e.name === name ? { ...e, on } : e) : [...list, { name, on }];
}
var ALL_FX = () => [
  { name: "grade", preset: "dusk" },
  { name: "fog" },
  { name: "glow" },
  { name: "rim" },
  { name: "vignette" },
  { name: "scanlines" },
  { name: "dither", screen: "auto" },
  { name: "outline", mode: "all" },
  { name: "cycle", ramps: ["water"] }
];
function fxUniforms(resolved, look) {
  const on = {};
  for (const p of resolved) if (p.on) on[p.name] = p.params;
  const ramp2 = (r) => typeof r === "number" ? r : look.ramp(r);
  const entry = (c) => {
    if (c == null) return -1;
    if (typeof c === "number") return c;
    const r = ramp2(c.ramp);
    if (r < 0) return -1;
    const [base, len2] = look.rampOf(r);
    return base + Math.max(0, Math.min(len2 - 1, c.index < 0 ? len2 + c.index : c.index));
  };
  const style = look.style ?? { screen: 4, dither: 0.9, outline: 1 };
  let screen = style.screen;
  let dither = style.dither;
  if (on.dither) {
    screen = on.dither.screen;
    dither = on.dither.amount;
  } else if (resolved.some((p) => p.name === "dither")) {
    screen = 0;
    dither = 0;
  }
  const bayer = { bayer2: 2, bayer4: 4, bayer8: 8, none: 0 };
  let uScreen;
  let tile = null;
  if (typeof screen === "string") {
    const b = Object.hasOwn(bayer, screen) ? bayer[screen] : void 0;
    if (b !== void 0) uScreen = b;
    else if (Object.hasOwn(SCREENS, screen)) {
      uScreen = -1;
      tile = screen;
    } else throw new RangeError(`Unknown screen: ${screen}`);
  } else uScreen = screen | 0;
  const ol = resolved.find((p) => p.name === "outline");
  let uOutline;
  let uOutlineInk;
  if (ol) {
    uOutline = ol.on ? [1, ol.params.steps, ol.params.gap / look.far] : [0, 3, 4e-3];
    uOutlineInk = ol.on ? entry(ol.params.color) : -1;
  } else {
    uOutline = [style.outline ? 1 : 0, 3, 4e-3];
    uOutlineInk = -1;
  }
  const { crt, fog, glow, rim, flash: fl, vignette: vig, scanlines: sc, cycle: cy } = on;
  const mats = fl ? [...fl.mats, -1, -1, -1, -1, -1, -1, -1, -1].slice(0, 8) : Array(8).fill(-1);
  const cycle = [];
  if (cy) {
    for (const [name, o] of Object.entries(cy.ramps)) {
      const r = ramp2(name);
      if (r < 0) continue;
      const len2 = look.rampOf(r)[1];
      cycle.push([r, Math.min(len2 - 1, Math.max(0, Math.round(o.from * len2))), o.speed]);
    }
  }
  const grade = [];
  if (on.grade) for (const [from, to] of Object.entries(on.grade.map)) {
    const a = ramp2(from);
    const b = ramp2(to);
    if (a >= 0 && b >= 0) grade.push([a, b]);
  }
  const u = {
    uScreen,
    uDither: dither,
    uOutline,
    uOutlineInk,
    uCrt: crt ? [1, crt.curve, Math.max(0, entry(crt.border)), 0] : [0, 0, 0, 0],
    uGrade: on.grade ? [1, on.grade.shift] : [0, 0],
    uFog: fog ? [ramp2(fog.ramp) >= 0 ? 1 : 0, fog.near, fog.far, fog.amount] : [0, 0, 1, 0],
    uFogLook: fog ? [Math.max(0, ramp2(fog.ramp)), fog.light] : [0, 0],
    uGlow: glow ? [1, glow.radius, glow.halo, glow.self] : [0, 1, 0, 0],
    uGlowK: glow ? [glow.threshold, glow.tint ? 1 : 0] : [1, 0],
    uRim: rim ? [1, rim.width, rim.steps, 0] : [0, 1, 0, 0],
    uRimDir: rim && isPair(rim.dir) ? rim.dir : null,
    // (null: the renderer aims it at the sun)
    uFlash: fl ? [fl.amount, fl.ramp == null ? -1 : ramp2(fl.ramp), fl.ids ? fl.ids[0] : 1, fl.ids ? fl.ids[1] : 0] : [0, -1, 1, 0],
    uFlashMats: mats,
    uVig: vig ? [1, vig.inner, vig.outer, vig.steps] : [0, 0, 1, 0],
    uScan: sc ? [1, sc.period, sc.dark, sc.steps] : [0, 2, 0, 0],
    uCycle: cycle.length ? 1 : 0
  };
  return { u, ramps: { cycle, grade }, screen: tile };
}
var isPair = (v) => Array.isArray(v);
function screenTile(id, tile = 192) {
  const at = SCREENS[id].at;
  const out = new Uint8Array(tile * tile);
  for (let y = 0; y < tile; y += 1) for (let x = 0; x < tile; x += 1) out[y * tile + x] = Math.max(0, Math.min(255, Math.round(at(x, y) * 255)));
  return out;
}

// ../../../../../../keel-engine/packages/render/src/shaders.ts
var MAX_BOXES = 256;
var MAX_WEDGES = 128;
var MAX_CAPS = 256;
var MAX_RAMPS = 256;
var MAX_MATERIALS = 255;
var PALETTE_WIDTH = 1024;
var MAX_COLOURS = PALETTE_WIDTH * 64;
var SCREEN_TILE = 192;
var FAR = 140;
var WATER_MAT = 4;
var SKY_MAT = 5;
var PARTICLE_MAT = 255;
var FULLSCREEN_VS = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
var WORLD_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
#define MAXB ${MAX_BOXES}
#define MAXW ${MAX_WEDGES}
#define MAXC ${MAX_CAPS}
#define FAR ${FAR.toFixed(1)}
uniform vec2 uRes;
uniform vec3 uEye, uFwd, uRight, uUp;
uniform float uTan, uTime;
uniform int uBoxes, uWedges, uCaps;
// The solids, in uniform blocks (fast to read in the march's inner loop; each block well under the 16 KB baseline).
layout(std140) uniform Boxes { vec4 uBox[2 * MAXB]; };      // [centre, mat][half, yaw]
layout(std140) uniform Wedges { vec4 uWedge[3 * MAXW]; };   // [centre, mat][half, yaw][lo, 0, 0, 0]
layout(std140) uniform Capsules { vec4 uCap[2 * MAXC]; };   // [a, r][b, mat]
uniform sampler2D uMats;   // row 0 per material: ramp, lightness scale, pattern (0 none, 1 checker), emissive
uniform vec3 uSun;
uniform float uWaterY, uFogNear, uFogFar;
layout(location = 0) out vec4 outData;  // lightness, ramp / 255, material / 255, id / 255
layout(location = 1) out vec4 outData2; // glow, facing, 0, 0

float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdCap(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0); return length(pa - ba * h) - r; }
// A wedge's cross-section in (z, y): the foot at +z (lo x its height), rising to full height at -z.
// Exact for a convex polygon: outside, the nearest edge; inside, the nearest edge's plane.
// (physics/character.js wedgeDistance is the same solid.)
float sdSection(vec2 p, vec2 h, float lo) {
  vec2 v[4] = vec2[4](vec2(-h.x, -h.y), vec2(h.x, -h.y), vec2(h.x, -h.y + 2.0 * h.y * lo), vec2(-h.x, h.y));
  float out2 = 1e18;
  float far = -1e9;
  bool inside = true;
  for (int i = 0; i < 4; i++) {
    vec2 a = v[i];
    vec2 e = v[(i + 1) & 3] - a;
    float L2 = dot(e, e);
    if (L2 < 1e-12) continue;
    vec2 w = p - a;
    vec2 q = w - e * clamp(dot(w, e) / L2, 0.0, 1.0);
    out2 = min(out2, dot(q, q));
    float s = (w.x * e.y - w.y * e.x) * inversesqrt(L2);
    if (s > 0.0) inside = false;
    far = max(far, s);
  }
  return inside ? far : sqrt(out2);
}
float sdWedge(vec3 q, vec3 h, float lo) {
  float a = abs(q.x) - h.x;
  float b = sdSection(q.zy, h.zy, lo);
  return length(max(vec2(a, b), 0.0)) + min(max(a, b), 0.0);
}

// The world: nearest distance and which thing (material in .y, index in .z).
vec3 map(vec3 p) {
  vec3 best = vec3(1e9, -1.0, -1.0);
  for (int i = 0; i < MAXB; i++) {
    if (i >= uBoxes) break;
    vec4 A = uBox[2 * i]; vec4 B = uBox[2 * i + 1];
    vec3 q = p - A.xyz;
    float c = cos(B.w), s = sin(B.w);
    q.xz = mat2(c, s, -s, c) * q.xz; // (world -> the box's frame, core/frame.js: x' = c x - s z, z' = s x + c z)
    float d = sdBox(q, B.xyz);
    if (d < best.x) best = vec3(d, A.w, float(i));
  }
  for (int i = 0; i < MAXW; i++) {
    if (i >= uWedges) break;
    vec4 A = uWedge[3 * i]; vec4 B = uWedge[3 * i + 1];
    float lo = uWedge[3 * i + 2].x;
    vec3 q = p - A.xyz;
    float c = cos(B.w), s = sin(B.w);
    q.xz = mat2(c, s, -s, c) * q.xz; // (the same turn as a box)
    float d = sdWedge(q, B.xyz, lo);
    // (A tapered wedge: its right and left edges run from its span at the back, -z, in to the foot's full width.)
    vec2 span = uWedge[3 * i + 2].zw * B.x;
    float mr = (B.x - span.y) / max(0.0001, 2.0 * B.z), ml = (B.x + span.x) / max(0.0001, 2.0 * B.z);
    d = max(d, (q.x - mr * q.z - (B.x + span.y) * 0.5) / sqrt(1.0 + mr * mr));
    d = max(d, (-q.x - ml * q.z - (B.x - span.x) * 0.5) / sqrt(1.0 + ml * ml));
    float skin = uWedge[3 * i + 2].y;
    if (skin > 0.0) {
      float slope = -B.y * (1.0 - lo) / max(0.0001, B.z);
      float top = B.y + slope * (q.z + B.z);
      d = max(d, (top - skin - q.y) / sqrt(1.0 + slope * slope));
    }
    if (d < best.x) best = vec3(d, A.w, float(200 + i));
  }
  for (int i = 0; i < MAXC; i++) {
    if (i >= uCaps) break;
    vec4 A = uCap[2 * i]; vec4 B = uCap[2 * i + 1];
    float d = sdCap(p, A.xyz, B.xyz, A.w);
    if (d < best.x) best = vec3(d, B.w, float(100 + i));
  }
  return best;
}
vec3 normalAt(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float e = 0.002;
  return normalize(k.xyy * map(p + k.xyy * e).x + k.yyx * map(p + k.yyx * e).x + k.yxy * map(p + k.yxy * e).x + k.xxx * map(p + k.xxx * e).x);
}
float shadowAt(vec3 p, vec3 l) {
  float res = 1.0, t = 0.05;
  for (int i = 0; i < 24; i++) {
    float h = map(p + l * t).x;
    res = min(res, 10.0 * h / t);
    t += clamp(h, 0.04, 0.6);
    if (res < 0.02 || t > 18.0) break;
  }
  return clamp(res, 0.0, 1.0);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; } return v; }

// Checker tiles on whichever face a point is on, with a dark joint.
float tiles(vec3 p, vec3 n) {
  vec2 uv = abs(n.y) > 0.6 ? p.xz : abs(n.x) > abs(n.z) ? p.zy : p.xy;
  vec2 g = uv * 1.0;
  vec2 f = fract(g);
  float joint = step(0.95, max(f.x, f.y)) * 0.06;
  float chk = mod(floor(g.x) + floor(g.y), 2.0);
  return 0.16 * chk - 0.08 - joint;
}
vec4 matOf(int i) { return texelFetch(uMats, ivec2(i, 0), 0); }

void main() {
  vec2 uv = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  float aspect = uRes.x / uRes.y;
  vec3 rd = normalize(uFwd + uv.x * uTan * aspect * uRight + uv.y * uTan * uUp);
  vec3 ro = uEye;
  float t = 0.05;
  vec3 hit = vec3(1e9, -1.0, -1.0);
  for (int i = 0; i < 110; i++) {
    vec3 h = map(ro + rd * t);
    if (h.x < 0.0015 * t) { hit = vec3(t, h.y, h.z); break; }
    t += h.x;
    if (t > FAR) break;
  }
  float tw = rd.y < -1e-4 ? (uWaterY - ro.y) / rd.y : 1e9;
  float L; float ramp; float id; float depth; float mat; float glow = 0.0; float facing = 1.0;
  if (tw < hit.x && tw < FAR) {
    // The water: dark and deep, bright where it meets what stands in it, rippled, catching the sky.
    vec3 p = ro + rd * tw;
    float edge = clamp(1.0 - map(p).x / 0.9, 0.0, 1.0);
    float ripple = fbm(p.xz * 1.7 + vec2(uTime * 0.35, uTime * 0.2)) ;
    float glint = step(0.72, fbm(p.xz * 5.0 + uTime * 0.8)) * 0.35 * clamp(1.0 - tw / 40.0, 0.0, 1.0);
    L = 0.1 + 0.16 * ripple * ripple + 0.7 * pow(edge, 3.0) + glint;
    L *= mix(1.0, 0.45, clamp((tw - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0));
    ramp = matOf(${WATER_MAT}).x; id = 254.0; depth = tw / FAR; mat = ${WATER_MAT}.0; facing = -rd.y;
  } else if (hit.y >= 0.0) {
    vec3 p = ro + rd * hit.x;
    vec3 n = normalAt(p);
    int mi = int(hit.y + 0.5);
    vec4 mr = matOf(mi);
    float sh = shadowAt(p + n * 0.01, uSun);
    float diff = max(dot(n, uSun), 0.0) * sh;
    // (Water light: the glow off the water reaches the bottom of walls.)
    float wglow = clamp(1.0 - (p.y - uWaterY) / 1.6, 0.0, 1.0) * max(0.0, -n.y * 0.2 + 0.8) * 0.35;
    L = (0.16 + 0.1 * n.y + 0.5 * diff) * mr.y + wglow + mr.w; // (headroom: the brightest lit face stays under the top of its ramp)
    // (Patterns know the resolution: a tile a few pixels across fades rather than aliasing, and small targets
    // quieten every pattern so the subject still reads.)
    float tilePx = uRes.y / max(hit.x * 2.0 * uTan, 1e-3);
    float patternK = smoothstep(2.5, 7.0, tilePx) * (0.35 + 0.65 * smoothstep(28.0, 96.0, uRes.y));
    if (mr.z > 0.5 && mr.z < 1.5) L += tiles(p, n) * patternK;
    L = mix(L, 0.12, clamp((hit.x - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0));
    ramp = mr.x; id = mod(hit.z, 250.0); depth = hit.x / FAR; mat = float(mi);
    glow = clamp(mr.w, 0.0, 1.0); facing = clamp(dot(n, -rd), 0.0, 1.0);
  } else {
    // The sky: a lid of low cloud, lit warm from somewhere, dark at the horizon.
    float up = max(rd.y, 0.0);
    vec2 sp = rd.xz / (rd.y + 0.12) * 1.4 + vec2(uTime * 0.02, 0.0);
    float cl = fbm(sp) * smoothstep(0.02, 0.35, up);
    L = 0.08 + cl * 0.75;
    ramp = matOf(${SKY_MAT}).x; id = 255.0; depth = 1.0; mat = ${SKY_MAT}.0;
  }
  outData = vec4(clamp(L, 0.0, 1.0), ramp / 255.0, mat / 255.0, id / 255.0);
  outData2 = vec4(glow, facing, 0.0, 0.0);
  gl_FragDepth = clamp(depth, 0.0, 1.0);
}`;
var POINTS_VS = `#version 300 es
in vec4 aPos;   // xyz, size
in vec3 aLook;  // lightness, ramp, glow
uniform vec3 uEye, uFwd, uRight, uUp;
uniform float uTan, uAspect, uH;
out vec3 vLook;
void main() {
  vec3 v = aPos.xyz - uEye;
  float z = dot(v, uFwd);
  float depth = length(v) / ${FAR.toFixed(1)};
  gl_Position = z > 0.05 ? vec4(dot(v, uRight) / (z * uTan * uAspect), dot(v, uUp) / (z * uTan), depth * 2.0 - 1.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = max(1.0, aPos.w * 6.0 * (uH / 128.0) / max(z, 0.5)); // (a speck is the same size in the world at any target: fewer pixels, smaller dots)
  vLook = aLook;
}`;
var POINTS_FS = `#version 300 es
precision highp float;
in vec3 vLook;
layout(location = 0) out vec4 outData;
layout(location = 1) out vec4 outData2;
void main() { outData = vec4(vLook.x, vLook.y / 255.0, ${PARTICLE_MAT}.0 / 255.0, 253.0 / 255.0); outData2 = vec4(vLook.z, 1.0, 0.0, 0.0); }`;
var PIXEL_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uData;
uniform sampler2D uData2;
uniform sampler2D uDepth;
uniform sampler2D uPalette; // colours, ${PALETTE_WIDTH} to a row
uniform sampler2D uRamps;   // row 0 per ramp: base, length, cycle from (entry), cycle speed (entries/s); row 1: graded ramp (-1 itself)
uniform sampler2D uScreenTex; // a core screen's thresholds, ${SCREEN_TILE} px square
uniform int uScreen;        // 0 none, 2 / 4 / 8: Bayer size, -1: the screen texture
uniform float uDither;      // how far the screen reaches between two entries (0..1)
uniform float uTime;
// Outline: on, steps darker, the depth gap behind that makes an edge (metres / FAR: 0.56 m the classic, more for outer-only)
uniform vec3 uOutline;
uniform int uOutlineInk;    // palette index to ink with (< 0: darken the pixel's own ramp)
uniform vec4 uFog;          // on, near, far, amount
uniform vec2 uFogLook;      // ramp, lightness it tends to
uniform vec4 uGlow;         // on, halo radius (px), halo steps, self steps
uniform vec2 uGlowK;        // threshold, tint (1: the halo wears the glowing thing's ramp)
uniform vec4 uVig;          // on, inner, outer, steps
uniform vec4 uScan;         // on, period (px), dark rows per period, steps
uniform vec4 uCrt;          // on, curvature, border palette index, 0
uniform vec4 uRim;          // on, width (px), steps, 0
uniform vec2 uRimDir;       // screen direction the light comes from
uniform vec4 uFlash;        // amount, ramp (-1: its own top), id from, id to
uniform ivec4 uFlashMats[2];// up to 8 materials (-1 none)
uniform vec2 uGrade;        // on, shift (entries)
uniform int uCycle;         // on
out vec4 outColor;

float bayer(ivec2 p, int n) {
  if (n == 2) { int m[4] = int[4](0, 2, 3, 1); return (float(m[(p.y & 1) * 2 + (p.x & 1)]) + 0.5) / 4.0; }
  if (n == 4) { int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5); return (float(m[(p.y & 3) * 4 + (p.x & 3)]) + 0.5) / 16.0; }
  // 8x8 from 4x4
  ivec2 q = p & 7;
  int m4[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  int a = m4[(q.y & 3) * 4 + (q.x & 3)];
  int b = m4[(q.y >> 2) * 4 + (q.x >> 2)];
  return (float(a * 4 + (b & 3)) + 0.5) / 64.0;
}
float screenAt(ivec2 p) {
  if (uScreen > 0) return bayer(p, uScreen);
  if (uScreen < 0) return texelFetch(uScreenTex, p % ${SCREEN_TILE}, 0).r;
  return 0.5;
}
vec4 pal(int i) { return texelFetch(uPalette, ivec2(i % ${PALETTE_WIDTH}, i / ${PALETTE_WIDTH}), 0); }
vec4 rampOf(int r) { return texelFetch(uRamps, ivec2(r, 0), 0); }
bool flashed(int mat, int id) {
  if (uFlash.x <= 0.0) return false;
  if (float(id) >= uFlash.z && float(id) <= uFlash.w) return true;
  for (int k = 0; k < 2; k++) { ivec4 m = uFlashMats[k]; if (m.x == mat || m.y == mat || m.z == mat || m.w == mat) return true; }
  return false;
}

void main() {
  ivec2 size = textureSize(uData, 0);
  ivec2 px = ivec2(gl_FragCoord.xy);
  vec2 res = vec2(size);
  // CRT: bend the picture as a tube does -- whole pixels moved, none invented.
  if (uCrt.x > 0.5) {
    vec2 uv = (vec2(px) + 0.5) / res * 2.0 - 1.0;
    uv *= 1.0 + uCrt.y * dot(uv, uv);
    if (abs(uv.x) > 1.0 || abs(uv.y) > 1.0) { outColor = pal(int(uCrt.z)); return; }
    px = clamp(ivec2(floor((uv * 0.5 + 0.5) * res)), ivec2(0), size - 1);
  }
  vec4 d = texelFetch(uData, px, 0);
  vec4 d2 = texelFetch(uData2, px, 0);
  float z = texelFetch(uDepth, px, 0).r;
  int ramp = int(d.g * 255.0 + 0.5);
  int mat = int(d.b * 255.0 + 0.5);
  int id = int(d.a * 255.0 + 0.5);
  float s = screenAt(ivec2(gl_FragCoord.xy)); // (the screen stays put on the glass, under a CRT's bend too)
  float L = d.r;

  // Colour grading: each ramp swapped for its graded one (day / dusk / night), and shifted along it.
  if (uGrade.x > 0.5) { float g = texelFetch(uRamps, ivec2(ramp, 1), 0).x; if (g >= 0.0) ramp = int(g); }
  // Fog: past its near, pixels go over to the fog's ramp -- the screen decides which, so the edge is dithered.
  if (uFog.x > 0.5 && id != 255) {
    float dist = z * ${FAR.toFixed(1)}; // (depth is the ray's length over FAR)
    float f = clamp((dist - uFog.y) / max(uFog.z - uFog.y, 1e-3), 0.0, 1.0) * uFog.w;
    if (f > s) { ramp = int(uFogLook.x); L = mix(L, uFogLook.y, f); }
  }
  vec4 R = rampOf(ramp);
  int base = int(R.x);
  int len = max(int(R.y), 1);
  float top = float(len - 1);
  float x = L * top;
  if (uGrade.x > 0.5) x += uGrade.y;

  // Glow: what glows climbs its ramp; round it, a halo climbs the ramps of what's near (or wears the glow's).
  if (uGlow.x > 0.5) {
    if (d2.r >= uGlowK.x) x += uGlow.w * d2.r;
    else {
      float best = 0.0;
      int bestRamp = -1;
      float r = uGlow.y;
      // (A golden-angle spiral of taps covers the disc evenly: about one tap per 1.5 px square at the largest radius.)
      int taps = int(clamp(r * r * 1.4, 8.0, 48.0));
      for (int k = 0; k < 48; k++) {
        if (k >= taps) break;
        float a = float(k) * 2.3999632;
        float rr = max(1.0, r * sqrt((float(k) + 0.5) / float(taps)));
        ivec2 q = clamp(px + ivec2(round(vec2(cos(a), sin(a)) * rr)), ivec2(0), size - 1);
        vec4 o2 = texelFetch(uData2, q, 0);
        if (o2.r >= uGlowK.x) {
          float f = rr / (r + 1.0);
          float w = smoothstep(uGlowK.x, uGlowK.x + 0.3, o2.r) * (1.0 - f * f); // (strong glows reach full halo; it falls off outward)
          if (w > best) { best = w; bestRamp = int(texelFetch(uData, q, 0).g * 255.0 + 0.5); }
        }
      }
      if (best > 0.0) {
        if (uGlowK.y > 0.5 && best * 1.6 > s) {
          ramp = bestRamp; R = rampOf(ramp); base = int(R.x); len = max(int(R.y), 1); top = float(len - 1);
          x = (0.35 + 0.4 * best) * top;
        } else x += uGlow.z * best;
      }
    }
  }
  // Rim light: a thing's edge on the light's side, where what's beyond it is far behind, climbs its ramp.
  if (uRim.x > 0.5 && id < 253) {
    ivec2 q = clamp(px + ivec2(round(uRimDir * uRim.y)), ivec2(0), size - 1);
    float oz = texelFetch(uDepth, q, 0).r;
    // (Only a silhouette: another thing, well behind -- a floor seen edge-on is one thing, and gets none.)
    if (abs(texelFetch(uData, q, 0).a - d.a) > 0.5 / 255.0 && oz > z + 0.004) x += uRim.z;
  }
  // Hit flash: the struck thing (by material, or by id) goes up toward white (or onto a flash ramp).
  if (flashed(mat, id)) {
    if (uFlash.y >= 0.0) { ramp = int(uFlash.y); R = rampOf(ramp); base = int(R.x); len = max(int(R.y), 1); top = float(len - 1); x = mix(L * top, top, uFlash.x); }
    else x = mix(x, top + 0.49, uFlash.x);
  }
  // Vignette: the corners step down their ramps.
  if (uVig.x > 0.5) {
    vec2 uv = gl_FragCoord.xy / res * 2.0 - 1.0;
    float r = length(uv * vec2(res.x / res.y, 1.0)) / length(vec2(res.x / res.y, 1.0));
    x -= smoothstep(uVig.y, uVig.z, r) * uVig.w;
  }
  // Scanlines: every so many rows, a step down.
  if (uScan.x > 0.5 && float(int(gl_FragCoord.y) % int(uScan.y)) < uScan.z) x -= uScan.w;

  // The outline: a thing's edge against what's behind it (mode 1), or only across a gap (2: outer only).
  bool edge = false;
  if (uOutline.x > 0.5 && d.a < 0.99) {
    float gap = uOutline.z; // (in depth: metres / FAR)
    for (int k = 0; k < 4; k++) {
      ivec2 o = k == 0 ? ivec2(1, 0) : k == 1 ? ivec2(-1, 0) : k == 2 ? ivec2(0, 1) : ivec2(0, -1);
      ivec2 q = clamp(px + o, ivec2(0), size - 1);
      float other = texelFetch(uData, q, 0).a;
      float oz = texelFetch(uDepth, q, 0).r;
      if (abs(other - d.a) > 0.5 / 255.0 && oz > z + gap) edge = true;
    }
  }
  if (edge && uOutlineInk >= 0) { outColor = pal(uOutlineInk); return; }

  // To an entry: the screen breaks the step between two.
  float th = uScreen == 0 ? 0.0 : s - 0.5;
  x = x + th * uDither;
  int idx = clamp(int(floor(x + 0.5)), 0, len - 1);
  if (edge) idx = max(0, idx - int(uOutline.y));
  // Palette cycling: a ramp's upper entries turn over, so water shimmers and neon runs.
  else if (uCycle == 1 && R.w > 0.0 && idx >= int(R.z)) { int from = int(R.z); idx = from + (idx - from + int(floor(uTime * R.w))) % (len - from); }
  outColor = pal(base + idx);
}`;

// ../../../../../../keel-engine/packages/render/src/indexed.ts
function edit(src, find, replace) {
  if (!src.includes(find)) throw new Error(`BAKE_WORLD_FS: WORLD_FS no longer contains ${JSON.stringify(find.slice(0, 60))}`);
  return src.replace(find, replace);
}
var SURFACE_UV = `// Where on its part a point is, 0..1 each way: a capsule's (round it, along it -- caps included); a ball's
// (longitude round y, latitude up it); a box's or a wedge's (across the face it's on).
vec2 surfaceUv(vec3 p, int k) {
  if (k >= 100 && k < 200) {
    int i = k - 100;
    vec4 A = uCap[2 * i]; vec4 B = uCap[2 * i + 1];
    vec3 ba = B.xyz - A.xyz;
    vec3 pa = p - A.xyz;
    float L2 = dot(ba, ba);
    if (L2 < 1e-8) { vec3 d = normalize(pa + vec3(0.0, 0.0, 1e-6)); return vec2(atan(d.x, d.z) / 6.2831853 + 0.5, d.y * 0.5 + 0.5); }
    float len = sqrt(L2);
    vec3 ax = ba / len;
    float h = dot(pa, ax);
    vec3 rad = pa - ax * clamp(h, 0.0, len);
    vec3 e1 = normalize(abs(ax.y) < 0.9 ? cross(ax, vec3(0.0, 1.0, 0.0)) : cross(ax, vec3(1.0, 0.0, 0.0)));
    vec3 e2 = cross(ax, e1);
    return vec2(atan(dot(rad, e2), dot(rad, e1)) / 6.2831853 + 0.5, clamp((h + A.w) / (len + 2.0 * A.w), 0.0, 1.0));
  }
  vec4 A; vec4 B;
  if (k < 100) { A = uBox[2 * k]; B = uBox[2 * k + 1]; } else { A = uWedge[3 * (k - 200)]; B = uWedge[3 * (k - 200) + 1]; }
  vec3 q = p - A.xyz;
  float c = cos(B.w), s = sin(B.w);
  q.xz = mat2(c, s, -s, c) * q.xz;
  vec3 r = q / max(B.xyz, vec3(1e-4));
  vec3 a = abs(r);
  vec2 f = a.x >= a.y && a.x >= a.z ? r.zy : a.y >= a.z ? r.xz : r.xy;
  return clamp(f * 0.5 + 0.5, 0.0, 1.0);
}

void main() {`;
var BAKE_WORLD_FS = [
  ["void main() {", `uniform vec4 uSplit;      // a point (xyz) the hits are split at, seen from the camera; w 1 on, 0 off
uniform float uOrthoH;    // > 0: an ORTHOGRAPHIC bake -- parallel rays over a picture this many metres half-high (the game's own view: nothing nearer the camera drawn bigger)
${SURFACE_UV}`],
  ["vec3 rd = normalize(uFwd + uv.x * uTan * aspect * uRight + uv.y * uTan * uUp);\n  vec3 ro = uEye;", "vec3 rd = uOrthoH > 0.0 ? uFwd : normalize(uFwd + uv.x * uTan * aspect * uRight + uv.y * uTan * uUp);\n  vec3 ro = uOrthoH > 0.0 ? uEye + (uv.x * aspect * uRight + uv.y * uUp) * uOrthoH : uEye;"],
  ["float L; float ramp; float id; float depth; float mat; float glow = 0.0; float facing = 1.0;", "float L; float ramp; float id; float depth; float mat; float glow = 0.0; float facing = 1.0; vec2 surf = vec2(0.0);"],
  ["glow = clamp(mr.w, 0.0, 1.0); facing = clamp(dot(n, -rd), 0.0, 1.0);", "glow = clamp(mr.w, 0.0, 1.0); facing = clamp(dot(n, -rd), 0.0, 1.0); surf = surfaceUv(p, int(hit.z + 0.5)); ramp = uSplit.w > 0.5 && dot(p - uSplit.xyz, uFwd) > 0.0 ? 1.0 : 0.0;"],
  ["outData2 = vec4(glow, facing, 0.0, 0.0);", "outData2 = vec4(glow, facing, surf);"]
].reduce((src, [find, replace]) => edit(src, find, replace), WORLD_FS);
var INDEX_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uData;
uniform sampler2D uData2;
uniform sampler2D uDepth;
uniform float uGap;         // the outline's depth gap (metres / FAR), as the pixel pass's uOutline.z
out vec4 outColor;
void main() {
  ivec2 size = textureSize(uData, 0);
  ivec2 px = ivec2(gl_FragCoord.xy);
  vec4 d = texelFetch(uData, px, 0);
  int id = int(d.a * 255.0 + 0.5);
  if (id >= 253) { outColor = vec4(0.0); return; }
  vec4 d2 = texelFetch(uData2, px, 0);
  float z = texelFetch(uDepth, px, 0).r;
  bool edge = false;
  for (int k = 0; k < 4; k++) {
    ivec2 o = k == 0 ? ivec2(1, 0) : k == 1 ? ivec2(-1, 0) : k == 2 ? ivec2(0, 1) : ivec2(0, -1);
    ivec2 q = clamp(px + o, ivec2(0), size - 1);
    float other = texelFetch(uData, q, 0).a;
    float oz = texelFetch(uDepth, q, 0).r;
    if (abs(other - d.a) > 0.5 / 255.0 && oz > z + uGap) edge = true;
  }
  int mat = min(int(d.b * 255.0 + 0.5), 31);
  bool behind = d.g > 0.5 / 255.0;
  outColor = vec4(float(128 + (edge ? 64 : 0) + (behind ? 32 : 0) + mat) / 255.0, d.r, d2.b, d2.a);
}`;
var HEIGHT_FS = `${WORLD_FS.slice(0, WORLD_FS.indexOf("void main() {"))}
uniform sampler2D uData;
uniform sampler2D uDepth;
uniform float uScale;       // texels a metre (the bake's pixels per metre)
uniform float uEps;         // how far the bake thinned each solid (metres)
uniform float uOrthoH;      // > 0: an orthographic bake (as pass 1's)
void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  int id = int(texelFetch(uData, px, 0).a * 255.0 + 0.5);
  if (id >= 253) { outData = vec4(0.0); outData2 = vec4(0.0); return; }
  float t = texelFetch(uDepth, px, 0).r * FAR;
  vec2 uv = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  vec3 rd = uOrthoH > 0.0 ? uFwd : normalize(uFwd + uv.x * uTan * (uRes.x / uRes.y) * uRight + uv.y * uTan * uUp);
  vec3 ro = uOrthoH > 0.0 ? uEye + (uv.x * (uRes.x / uRes.y) * uRight + uv.y * uUp) * uOrthoH : uEye;
  // (Back off past where the march could have overshot, then march onto the shell pass 1 calls a hit -- the thinned
  // field within its hit tolerance, 0.0015 x the ray's length: at the bake's distance, uEps, the design's own
  // surface -- the first point along the ray the colours were drawn from, never past it.)
  float s = max(0.0, t - 3.0 * max(uEps, 0.0015 * t) - 0.002);
  for (int i = 0; i < 48; i++) {
    float d = map(ro + rd * s).x - 0.0015 * s;
    if (d < 0.0002) break;
    s += d;
    if (s > t) { s = t; break; }
  }
  float y = max(ro.y + rd.y * s, 0.0);
  uint v = uint(clamp(floor(y * uScale * 16.0 + 1.5), 1.0, 65535.0));
  outData = vec4(float(v >> 8u) / 255.0, float(v & 255u) / 255.0, 0.0, 1.0);
  outData2 = vec4(0.0);
}`;
var DEPTH_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uDepth;
out vec4 outColor;
void main() {
  float z = texelFetch(uDepth, ivec2(gl_FragCoord.xy), 0).r;
  uint v = uint(clamp(z, 0.0, 1.0) * 16777215.0 + 0.5);
  outColor = vec4(float(v >> 16u) / 255.0, float((v >> 8u) & 255u) / 255.0, float(v & 255u) / 255.0, 1.0);
}`;
var unpackDepth = (r, g, b) => (r << 16 | g << 8 | b) / 16777215;

// ../../../../../../keel-engine/packages/render/src/raster.ts
var RASTER_FLOATS = 16;
var DIRECT_MAT = 254;
function boxTemplate() {
  const faces = [
    // normal, u axis, v axis (u x v = normal: counter-clockwise from outside)
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]
  ];
  const verts = [], norms = [], index = [];
  faces.forEach(([n, u, v], f) => {
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      verts.push(n[0] + u[0] * a + v[0] * b, n[1] + u[1] * a + v[1] * b, n[2] + u[2] * a + v[2] * b);
      norms.push(n[0], n[1], n[2]);
    }
    index.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
  });
  return { verts: Float32Array.from(verts), norms: Float32Array.from(norms), index: Uint16Array.from(index) };
}
function capsuleTemplate(around = 10, rings = 3) {
  const verts = [], norms = [], index = [];
  const row = around + 1;
  const rows = [];
  for (let k = 0; k <= rings; k += 1) rows.push([-Math.PI / 2 + k / rings * (Math.PI / 2), 0]);
  for (let k = 0; k <= rings; k += 1) rows.push([k / rings * (Math.PI / 2), 1]);
  for (const [phi, end] of rows) for (let i = 0; i <= around; i += 1) {
    const th = i / around * Math.PI * 2;
    verts.push(Math.cos(th), Math.sin(th), Math.sin(phi));
    norms.push(Math.cos(phi), end, 0);
  }
  for (let r = 0; r < rows.length - 1; r += 1) for (let i = 0; i < around; i += 1) {
    const a = r * row + i, b = a + 1, c = a + row, d = c + 1;
    index.push(a, c, b, b, c, d);
  }
  return { verts: Float32Array.from(verts), norms: Float32Array.from(norms), index: Uint16Array.from(index) };
}
var FARS = FAR.toFixed(1);
var RASTER_VS = `#version 300 es
layout(location=0) in vec3 aVert;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec4 aI0;
layout(location=3) in vec4 aI1;
layout(location=4) in vec4 aI2;
layout(location=5) in vec4 aI3;
uniform int uKind;
uniform vec3 uEye, uFwd, uRight, uUp;
uniform float uTan, uAspect;
out vec3 vPos;
out vec3 vNorm;
flat out vec4 vLook;   // material, ramp (-1: the material's), light scale, id
flat out vec4 vFx;     // fade, glow, 0, 0
out float vShade;      // a mesh vertex's lightness offset
// (Own frame -> world, the inverse of WORLD_FS's world -> box turn: x = c x' + s z', z = -s x' + c z'.)
vec3 turn(vec3 q, float yaw) { float c = cos(yaw), s = sin(yaw); return vec3(c * q.x + s * q.z, q.y, -s * q.x + c * q.z); }
void main() {
  vec3 p; vec3 n;
  vShade = 0.0;
  if (uKind == 0) {
    p = aVert; n = aNorm;
    vLook = vec4(aI0.x, aI0.y, 1.0, aI0.w); vFx = vec4(1.0, 0.0, 0.0, 0.0); vShade = aI0.z;
  } else if (uKind == 3) {
    vec3 a = aI0.xyz, b = aI1.xyz;
    float r = aI1.w;
    vec3 ax = b - a;
    float L = length(ax);
    ax = L > 1e-6 ? ax / L : vec3(0.0, 1.0, 0.0);
    vec3 u = normalize(abs(ax.y) < 0.9 ? cross(ax, vec3(0.0, 1.0, 0.0)) : cross(ax, vec3(1.0, 0.0, 0.0)));
    vec3 v = cross(ax, u);
    float sp = aVert.z, cp = aNorm.x;
    bool atB = aNorm.y > 0.5;
    // (phi runs from a's pole -- back along the axis, sin phi = -1 -- through the two equators to b's.)
    vec3 d = cp * (aVert.x * u + aVert.y * v) + sp * ax;
    p = (atB ? b : a) + r * d;
    n = d;
    vLook = vec4(aI0.w, aI2.y, aI2.z, aI2.w); vFx = aI3;
  } else {
    vec3 h = aI1.xyz;
    vec3 q = aVert;
    vec3 nq = aNorm;
    if (uKind == 2) {
      float lo = aI2.x;
      // (The +z edge of the top comes down to the foot: lo x its height.)
      if (q.y > 0.5 && q.z > 0.5) q.y = -1.0 + 2.0 * lo;
      if (nq.y > 0.5) nq = normalize(vec3(0.0, 2.0 * h.z, 2.0 * h.y * (1.0 - lo)));
    }
    p = aI0.xyz + turn(q * h, aI1.w);
    n = turn(uKind == 2 ? nq : aNorm, aI1.w);
    vLook = vec4(aI0.w, aI2.y, aI2.z, aI2.w); vFx = aI3;
  }
  vPos = p; vNorm = n;
  vec3 e = p - uEye;
  float z = dot(e, uFwd);
  const float NEAR = 0.05, FARZ = ${FARS} * 1.5;
  gl_Position = vec4(dot(e, uRight) / (uTan * uAspect), dot(e, uUp) / uTan, z * (FARZ + NEAR) / (FARZ - NEAR) - 2.0 * FARZ * NEAR / (FARZ - NEAR), z);
}`;
var RASTER_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uMats;
uniform vec3 uEye, uSun;
uniform float uWaterY, uFogNear, uFogFar, uTan, uTime;
uniform vec2 uRes;
in vec3 vPos;
in vec3 vNorm;
flat in vec4 vLook;
flat in vec4 vFx;
in float vShade;
layout(location = 0) out vec4 outData;
layout(location = 1) out vec4 outData2;
float bayer4(ivec2 p) { int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5); return (float(m[(p.y & 3) * 4 + (p.x & 3)]) + 0.5) / 16.0; }
vec4 matOf(int i) { return texelFetch(uMats, ivec2(i, 0), 0); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
// (Engine patterns past the checker: 2 grain -- a ground's speckle, blades and pebbles at a pixel or two -- and 3
// strata -- a cliff's bands. Both fade out where a cell would be under a pixel, as the checker does.)
float grain(vec3 p, vec3 n, float px) {
  vec2 uv = abs(n.y) > 0.6 ? p.xz : abs(n.x) > abs(n.z) ? p.zy : p.xy;
  float fine = hash(floor(uv * 7.0)) - 0.5, coarse = vnoise(uv * 0.9) - 0.5;
  return (fine * 0.12 * smoothstep(1.2, 3.0, px / 7.0) + coarse * 0.14);
}
float strata(vec3 p, float px) { return (vnoise(vec2(p.x * 0.7 + p.z * 0.7, p.y * 3.1)) - 0.5) * 0.2 + (hash(floor(vec2(p.x + p.z, p.y) * 5.0)) - 0.5) * 0.07 * smoothstep(1.2, 3.0, px / 5.0); }
float tiles(vec3 p, vec3 n) {
  vec2 uv = abs(n.y) > 0.6 ? p.xz : abs(n.x) > abs(n.z) ? p.zy : p.xy;
  vec2 f = fract(uv);
  float joint = step(0.95, max(f.x, f.y)) * 0.06;
  float chk = mod(floor(uv.x) + floor(uv.y), 2.0);
  return 0.16 * chk - 0.08 - joint;
}
void main() {
  // (A dissolve: the solid keeps the screen's lower thresholds, a sprite fading in keeps the rest.)
  if (vFx.x < 0.999 && bayer4(ivec2(gl_FragCoord.xy)) >= vFx.x) discard;
  vec3 n = normalize(vNorm);
  vec3 e = vPos - uEye;
  float dist = length(e);
  vec3 rd = e / max(dist, 1e-6);
  if (dot(n, rd) > 0.0) n = -n; // (a face seen from behind: light it as its front)
  int mi = int(vLook.x + 0.5);
  vec4 mr = matOf(mi);
  float ramp = vLook.y >= 0.0 ? vLook.y : mr.x;
  float L;
  float tilePx = uRes.y / max(dist * 2.0 * uTan, 1e-3); // (picture pixels a metre here)
  if (mi == ${WATER_MAT}) {
    // (Water as a surface: dark and deep, rippled, brighter toward the eye's grazing angle, a glint here and there.)
    float ripple = vnoise(vPos.xz * 1.3 + vec2(uTime * 0.35, uTime * 0.22)) * vnoise(vPos.xz * 0.6 - vec2(uTime * 0.1, 0.0));
    float glint = step(0.8, vnoise(vPos.xz * 4.0 + uTime * 0.7)) * 0.25 * clamp(1.0 - dist / 40.0, 0.0, 1.0);
    L = 0.14 + 0.22 * ripple + 0.2 * pow(1.0 - clamp(-rd.y, 0.0, 1.0), 3.0) + glint + vShade;
  } else {
    float diff = max(dot(n, uSun), 0.0);
    float wglow = clamp(1.0 - (vPos.y - uWaterY) / 1.6, 0.0, 1.0) * max(0.0, -n.y * 0.2 + 0.8) * 0.35;
    L = (0.16 + 0.1 * n.y + 0.5 * diff) * mr.y * vLook.z + wglow + mr.w + vFx.y + vShade;
    float patternK = smoothstep(2.5, 7.0, tilePx) * (0.35 + 0.65 * smoothstep(28.0, 96.0, uRes.y));
    if (mr.z > 0.5 && mr.z < 1.5) L += tiles(vPos, n) * patternK;
    else if (mr.z > 1.5 && mr.z < 2.5) L += grain(vPos, n, tilePx);
    else if (mr.z > 2.5 && mr.z < 3.5) L += strata(vPos, tilePx);
  }
  L = mix(L, 0.12, clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0));
  outData = vec4(clamp(L, 0.0, 1.0), ramp / 255.0, float(mi) / 255.0, mod(vLook.w, 250.0) / 255.0);
  outData2 = vec4(clamp(mr.w + vFx.y, 0.0, 1.0), clamp(dot(n, -rd), 0.0, 1.0), 0.0, 0.0);
  gl_FragDepth = clamp(dist / ${FARS}, 0.0, 1.0);
}`;
var DEPTH_OUT_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uDepth;
uniform vec2 uMap; // scale, bias
out vec4 outColor;
void main() {
  gl_FragDepth = clamp(texelFetch(uDepth, ivec2(gl_FragCoord.xy), 0).r * uMap.x + uMap.y, 0.0, 1.0);
  outColor = vec4(0.0);
}`;
var DIRECT_PIXEL_FS = PIXEL_FS.replace("  float L = d.r;\n", `  float L = d.r;
  // (Engine, DIRECT_MAT: a palette index straight -- its ramp's base, length and place ride along for the outline and fog.)
  int directBase = -1, directLen = 1, directPos = 0;
  if (mat == ${DIRECT_MAT} && d2.a > 0.0) {
    int pl = int(d2.a * 255.0 + 0.5);
    directPos = pl & 15;
    directLen = max(1, pl >> 4);
    directBase = int(d.r * 255.0 + 0.5) + int(d.g * 255.0 + 0.5) * 256 - directPos;
    L = d2.b;
  }
`).replace("  if (uGrade.x > 0.5) { float g", "  if (uGrade.x > 0.5 && directBase < 0) { float g").replace("    if (f > s) { ramp = int(uFogLook.x); L = mix(L, uFogLook.y, f); }\n  }\n  vec4 R = rampOf(ramp);", "    if (f > s) { ramp = int(uFogLook.x); L = mix(L, uFogLook.y, f); directBase = -1; }\n  }\n  vec4 R = directBase >= 0 ? vec4(float(directBase), float(directLen), 0.0, 0.0) : rampOf(ramp);").replace("  float x = L * top;\n", "  float x = directBase >= 0 ? float(directPos) : L * top;\n");
if (!DIRECT_PIXEL_FS.includes("directBase = -1; }") || !DIRECT_PIXEL_FS.includes("float(directPos) : L * top") || !DIRECT_PIXEL_FS.includes("directBase < 0) { float g") || !DIRECT_PIXEL_FS.includes("directPos = pl & 15")) throw new Error("DIRECT_PIXEL_FS: PIXEL_FS changed under its edits.");

// ../../../../../../keel-engine/packages/render/src/smooth.ts
function smoothPixelFs(fs) {
  const edits = [
    ["uniform int uCycle;         // on\n", "uniform int uCycle;         // on\nuniform int uSS;            // samples to an art pixel, each way (smooth edges)\n"],
    ["float s = screenAt(ivec2(gl_FragCoord.xy));", "float s = screenAt(ivec2(gl_FragCoord.xy) / uSS);"],
    ["ivec2(round(vec2(cos(a), sin(a)) * rr))", "ivec2(round(vec2(cos(a), sin(a)) * rr * float(uSS)))"],
    ["ivec2(round(uRimDir * uRim.y))", "ivec2(round(uRimDir * uRim.y * float(uSS)))"],
    ["ivec2 q = clamp(px + o, ivec2(0), size - 1);", "ivec2 q = clamp(px + o * uSS, ivec2(0), size - 1);"],
    ["float(int(gl_FragCoord.y) % int(uScan.y))", "float((int(gl_FragCoord.y) / uSS) % int(uScan.y))"]
  ];
  let out = fs;
  for (const [from, to] of edits) {
    if (!out.includes(from)) throw new Error(`smoothPixelFs: the pixel pass changed under its edit (${from.trim().slice(0, 40)})`);
    out = out.replace(from, to);
  }
  return out;
}
function smoothDepthOutFs(fs) {
  const a = "uniform vec2 uMap; // scale, bias\n", b = "texelFetch(uDepth, ivec2(gl_FragCoord.xy), 0)";
  if (!fs.includes(a) || !fs.includes(b)) throw new Error("smoothDepthOutFs: the depth pass changed under its edit");
  return fs.replace(a, a + "uniform int uSS;\n").replace(b, "texelFetch(uDepth, ivec2(gl_FragCoord.xy) * uSS + uSS / 2, 0)");
}
var RESOLVE_FS = `#version 300 es
precision highp float;
uniform sampler2D uColour;
uniform int uSS;
out vec4 outColor;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) * uSS;
  vec3 acc = vec3(0.0);
  for (int y = 0; y < 4; y++) {
    if (y >= uSS) break;
    for (int x = 0; x < 4; x++) {
      if (x >= uSS) break;
      vec3 c = texelFetch(uColour, p + ivec2(x, y), 0).rgb;
      acc += c * c;
    }
  }
  outColor = vec4(sqrt(acc / float(uSS * uSS)), 1.0);
}`;
function supersampleFor(width, height, asked = "auto", budget = 11e5) {
  if (asked !== "auto") return Math.max(1, Math.min(4, Math.round(asked)));
  for (const k of [3, 2]) if (width * height * k * k <= budget) return k;
  return 1;
}

// ../../../../../../keel-engine/packages/render/src/link-program.ts
function linkProgram(gl, vertex, fragment, name = "Program") {
  const shaders = [];
  const attached = [];
  let program2 = null;
  let linked = false;
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error(`${name}: shader allocation failed`);
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
    }
    program2 = gl.createProgram();
    if (!program2) throw new Error(`${name}: program allocation failed`);
    for (const shader of shaders) {
      gl.attachShader(program2, shader);
      attached.push(shader);
    }
    gl.linkProgram(program2);
    if (!gl.getProgramParameter(program2, gl.LINK_STATUS)) {
      const errors = [];
      for (const shader of shaders) {
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) errors.push(gl.getShaderInfoLog(shader) || "shader compile failed");
      }
      throw new Error(`${name}: ${errors.join("; ") || gl.getProgramInfoLog(program2) || "program link failed"}`);
    }
    linked = true;
    return program2;
  } finally {
    if (program2) for (const shader of attached) gl.detachShader(program2, shader);
    for (const shader of shaders) gl.deleteShader(shader);
    if (program2 && !linked) gl.deleteProgram(program2);
  }
}

// ../../../../../../keel-engine/packages/render/src/program.ts
function program(gl, vs, fs) {
  const p = linkProgram(gl, vs, fs, "Pixel renderer");
  try {
    const loc = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i += 1) {
      const u = gl.getActiveUniform(p, i);
      if (u) loc[u.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, u.name);
    }
    return { p, loc };
  } catch (error) {
    gl.deleteProgram(p);
    throw error;
  }
}

// ../../../../../../keel-engine/packages/render/src/indexed-pass.ts
var norm2 = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
function createIndexedPass(env, createDepth) {
  const gl = env.gl;
  const nearest = () => {
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  };
  let extra = null;
  function bakeMode() {
    if (!extra) {
      const bw = program(gl, FULLSCREEN_VS, BAKE_WORLD_FS);
      ["Boxes", "Wedges", "Capsules"].forEach((name, i) => gl.uniformBlockBinding(bw.p, gl.getUniformBlockIndex(bw.p, name), i));
      extra = { world: bw, index: program(gl, FULLSCREEN_VS, INDEX_FS), depth: createDepth?.() ?? null, height: null, fb: gl.createFramebuffer(), tex: gl.createTexture(), w: 0, h: 0 };
    }
    if (extra.w !== env.width || extra.h !== env.height) {
      gl.bindTexture(gl.TEXTURE_2D, extra.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, env.width, env.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      nearest();
      gl.bindFramebuffer(gl.FRAMEBUFFER, extra.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, extra.tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      extra.w = env.width;
      extra.h = env.height;
    }
    return extra;
  }
  function pass(prog, fb, textures) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, env.width, env.height);
    gl.useProgram(prog);
    textures.forEach(([t, loc], i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(loc, i);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, env.quad);
    const a = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function readTarget(fb, attachment) {
    const out = new Uint8Array(env.width * env.height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    if (fb) gl.readBuffer(attachment);
    gl.readPixels(0, 0, env.width, env.height, gl.RGBA, gl.UNSIGNED_BYTE, out);
    if (fb) gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  }
  const api = {
    renderIndexed({ eye, target: look, fov = 1.2, time = 0, sun = [0.4, 0.8, 0.3], waterY = 0, fogNear = 25, fogFar = 110, gap = 0.56, split, ortho = 0 }) {
      const x = bakeMode();
      const { forward: fwd, right, up } = cameraBasis(eye, look);
      gl.bindFramebuffer(gl.FRAMEBUFFER, env.fbo);
      gl.viewport(0, 0, env.width, env.height);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.ALWAYS);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const BW = x.world.loc;
      gl.useProgram(x.world.p);
      gl.uniform2f(BW.uRes, env.width, env.height);
      gl.uniform3fv(BW.uEye, eye);
      gl.uniform3fv(BW.uFwd, fwd);
      gl.uniform3fv(BW.uRight, right);
      gl.uniform3fv(BW.uUp, up);
      gl.uniform1f(BW.uTan, Math.tan(fov / 2));
      gl.uniform1f(BW.uTime, time);
      gl.uniform1i(BW.uBoxes, env.counts.boxes);
      gl.uniform1i(BW.uWedges, env.counts.wedges);
      gl.uniform1i(BW.uCaps, env.counts.capsules);
      for (const blk of env.blocks) gl.bindBufferBase(gl.UNIFORM_BUFFER, blk.i, blk.buf);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, env.matTex);
      gl.uniform1i(BW.uMats, 1);
      gl.uniform3fv(BW.uSun, norm2(sun));
      gl.uniform1f(BW.uWaterY, waterY);
      gl.uniform1f(BW.uFogNear, fogNear);
      gl.uniform1f(BW.uFogFar, fogFar);
      gl.uniform4f(BW.uSplit, split?.[0] ?? 0, split?.[1] ?? 0, split?.[2] ?? 0, split ? 1 : 0);
      gl.uniform1f(BW.uOrthoH, ortho);
      gl.bindBuffer(gl.ARRAY_BUFFER, env.quad);
      const aw = gl.getAttribLocation(x.world.p, "aPos");
      gl.enableVertexAttribArray(aw);
      gl.vertexAttribPointer(aw, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(x.index.p);
      gl.uniform1f(x.index.loc.uGap, gap / FAR);
      pass(x.index.p, x.fb, [[env.dataTex, x.index.loc.uData], [env.data2Tex, x.index.loc.uData2], [env.depthTex, x.index.loc.uDepth]]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return x.fb;
    },
    readIndexed() {
      return readTarget(bakeMode().fb, gl.COLOR_ATTACHMENT0);
    },
    renderIndexedHeights({ eye, target: look, fov = 1.2, pixelsPerMetre, eps = 0, ortho = 0 }) {
      const x = bakeMode();
      if (!x.height) {
        x.height = program(gl, FULLSCREEN_VS, HEIGHT_FS);
        ["Boxes", "Wedges", "Capsules"].forEach((name, i) => gl.uniformBlockBinding(x.height.p, gl.getUniformBlockIndex(x.height.p, name), i));
      }
      const hp = x.height;
      const { forward: fwd, right, up } = cameraBasis(eye, look);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(hp.p);
      const L = hp.loc;
      gl.uniform2f(L.uRes, env.width, env.height);
      gl.uniform3fv(L.uEye, eye);
      gl.uniform3fv(L.uFwd, fwd);
      gl.uniform3fv(L.uRight, right);
      gl.uniform3fv(L.uUp, up);
      gl.uniform1f(L.uTan, Math.tan(fov / 2));
      gl.uniform1f(L.uScale, pixelsPerMetre);
      gl.uniform1f(L.uEps, eps);
      gl.uniform1f(L.uOrthoH, ortho);
      gl.uniform1i(L.uBoxes, env.counts.boxes);
      gl.uniform1i(L.uWedges, env.counts.wedges);
      gl.uniform1i(L.uCaps, env.counts.capsules);
      for (const blk of env.blocks) gl.bindBufferBase(gl.UNIFORM_BUFFER, blk.i, blk.buf);
      pass(hp.p, x.fb, [[env.dataTex, L.uData], [env.depthTex, L.uDepth]]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return x.fb;
    }
  };
  return {
    ...api,
    mode: bakeMode,
    pass,
    readTarget,
    dispose() {
      if (!extra) return;
      for (const p of [extra.world, extra.index, extra.depth, extra.height]) if (p) gl.deleteProgram(p.p);
      gl.deleteTexture(extra.tex);
      gl.deleteFramebuffer(extra.fb);
      extra = null;
    }
  };
}

// ../../../../../../keel-engine/packages/render/src/world-buffers.ts
function uploadWorld(gl, blocks, { boxes = [], wedges = [], capsules = [] }) {
  const [boxBlock, wedgeBlock, capBlock] = blocks;
  let nBoxes = 0, nWedges = 0, nCaps = 0;
  const bx = [];
  const wd = [...wedges];
  for (const b of boxes) (b.kind === "wedge" ? wd : bx).push(b);
  nBoxes = Math.min(MAX_BOXES, bx.length);
  for (let i = 0; i < nBoxes; i += 1) {
    const b = bx[i];
    boxBlock.data.set([b.c[0], b.c[1], b.c[2], b.mat ?? 0, b.h[0], b.h[1], b.h[2], b.yaw ?? 0], i * 8);
  }
  nWedges = Math.min(MAX_WEDGES, wd.length);
  for (let i = 0; i < nWedges; i += 1) {
    const w = wd[i];
    wedgeBlock.data.set([w.c[0], w.c[1], w.c[2], w.mat ?? 0, w.h[0], w.h[1], w.h[2], w.yaw ?? 0, Math.max(0, Math.min(0.98, w.lo ?? 0)), Math.max(0, w.skin ?? 0), Math.max(-1, Math.min(1, w.top?.[0] ?? -1)), Math.max(-1, Math.min(1, w.top?.[1] ?? 1))], i * 12);
  }
  nCaps = Math.min(MAX_CAPS, capsules.length);
  for (let i = 0; i < nCaps; i += 1) {
    const c = capsules[i];
    capBlock.data.set([c.a[0], c.a[1], c.a[2], c.r, c.b[0], c.b[1], c.b[2], c.mat ?? 0], i * 8);
  }
  for (const [blk, n] of [[boxBlock, nBoxes * 8], [wedgeBlock, nWedges * 12], [capBlock, nCaps * 8]]) {
    gl.bindBuffer(gl.UNIFORM_BUFFER, blk.buf);
    if (n) gl.bufferSubData(gl.UNIFORM_BUFFER, 0, blk.data, 0, n);
  }
  return { boxes: nBoxes, wedges: nWedges, capsules: nCaps, dropped: bx.length - nBoxes + wd.length - nWedges + capsules.length - nCaps };
}

// ../../../../../../keel-engine/packages/render/src/pixel-renderer.ts
var norm3 = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
var dot2 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function createPixelRenderer(canvas, { width = 128, height = 128, bakeOnly = false, profile: profile2 } = {}) {
  const ctx = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
  if (!ctx) throw new Error("WebGL2 is not available");
  const gl = ctx;
  let worldP = null, pixelP = null, pointsP = null;
  let directPixelP = null;
  const colourPrograms = () => {
    if (!worldP) {
      const w = program(gl, FULLSCREEN_VS, WORLD_FS);
      if (bakeOnly) ["Boxes", "Wedges", "Capsules"].forEach((name, i) => gl.uniformBlockBinding(w.p, gl.getUniformBlockIndex(w.p, name), i));
      worldP = w;
      pixelP = program(gl, FULLSCREEN_VS, PIXEL_FS);
      pointsP = program(gl, POINTS_VS, POINTS_FS);
    }
    return { world: worldP, pixel: pixelP, points: pointsP };
  };
  if (!bakeOnly) colourPrograms();
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const pbuf = gl.createBuffer();
  const nearest = () => {
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  };
  const floatTex = (w, h, data = null) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
    nearest();
    return t;
  };
  let W2 = width;
  let H = height;
  let fbo = null;
  let dataTex = null;
  let data2Tex = null;
  let depthTex = null;
  function target(w, h) {
    W2 = w;
    H = h;
    canvas.width = W2;
    canvas.height = H;
    for (const t of [dataTex, data2Tex, depthTex]) if (t) gl.deleteTexture(t);
    if (fbo) gl.deleteFramebuffer(fbo);
    const rgba8 = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W2, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      nearest();
      return t;
    };
    dataTex = rgba8();
    data2Tex = rgba8();
    depthTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depthTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, W2, H, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    nearest();
    fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dataTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, data2Tex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    fxDirty = true;
  }
  const blocks = [["Boxes", 2 * MAX_BOXES], ["Wedges", 3 * MAX_WEDGES], ["Capsules", 2 * MAX_CAPS]].map(([name, vecs], i) => {
    const data = new Float32Array(vecs * 4);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, buf);
    gl.bufferData(gl.UNIFORM_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
    if (worldP) gl.uniformBlockBinding(worldP.p, gl.getUniformBlockIndex(worldP.p, name), i);
    return { data, buf, i };
  });
  const [boxBlock, wedgeBlock, capBlock] = blocks;
  const rampRows = new Float32Array(MAX_RAMPS * 2 * 4);
  const rampTex = floatTex(MAX_RAMPS, 2, rampRows);
  const matRows = new Float32Array(256 * 4);
  const matTex = floatTex(256, 1, matRows);
  const screenTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, screenTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, SCREEN_TILE, SCREEN_TILE, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(SCREEN_TILE * SCREEN_TILE));
  nearest();
  let screenLoaded = null;
  const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  let query = null;
  let gpuMs = null;
  let palTex = null;
  let palette = [];
  let rampIndex = /* @__PURE__ */ new Map();
  let rampList = [];
  let nBoxes = 0;
  let nWedges = 0;
  let nCaps = 0;
  let style = { screen: 4, dither: 0.9, outline: 1 };
  let activeProfile = targetProfile("native");
  let authoredSize = [width, height];
  let authoredStyle = { ...style };
  let authoredPalette = [];
  let authoredRamps = {};
  let fxList = [];
  let fxResolved = [];
  let fxU = null;
  let fxDirty = true;
  function uploadRamps() {
    rampRows.fill(0);
    rampList.forEach(([base, len2], i) => {
      rampRows.set([base, len2, 0, 0], i * 4);
    });
    for (let i = 0; i < MAX_RAMPS; i += 1) rampRows[(MAX_RAMPS + i) * 4] = -1;
    if (fxU) {
      for (const [r, from, speed] of fxU.ramps.cycle) {
        rampRows[r * 4 + 2] = from;
        rampRows[r * 4 + 3] = speed;
      }
      for (const [r, to] of fxU.ramps.grade) rampRows[(MAX_RAMPS + r) * 4] = to;
    }
    gl.bindTexture(gl.TEXTURE_2D, rampTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAX_RAMPS, 2, gl.RGBA, gl.FLOAT, rampRows);
  }
  function refreshFx() {
    fxResolved = resolveFx(fxList, { width: W2, height: H });
    const u = fxUniforms(fxResolved, { ramp: (n) => rampIndex.get(n) ?? -1, rampOf: (i) => rampList[i] ?? [0, 1], style, far: FAR });
    fxU = u;
    if (u.screen && u.screen !== screenLoaded) {
      gl.bindTexture(gl.TEXTURE_2D, screenTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SCREEN_TILE, SCREEN_TILE, gl.RED, gl.UNSIGNED_BYTE, screenTile(u.screen, SCREEN_TILE));
      screenLoaded = u.screen;
    }
    uploadRamps();
    fxDirty = false;
    return u;
  }
  target(W2, H);
  let edges = "smooth";
  let supersample = "auto";
  let lastK = 1;
  let fine = null;
  let smoothPixelP = null, smoothDirectP = null, resolveP = null, smoothDepthOutP = null;
  function fineBuffers(k) {
    if (fine && fine.k === k && fine.w === W2 * k && fine.h === H * k) return fine;
    if (fine) {
      for (const t of [fine.data, fine.data2, fine.depth, fine.colour]) gl.deleteTexture(t);
      gl.deleteFramebuffer(fine.fbo);
      gl.deleteFramebuffer(fine.colourFbo);
    }
    const w = W2 * k, h = H * k;
    const tex = (internal, format, type) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
      nearest();
      return t;
    };
    const data = tex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE), data2 = tex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE), depth = tex(gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, data, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, data2, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    const colour2 = tex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE), colourFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, colourFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colour2, 0);
    fine = { k, w, h, fbo: fb, data, data2, depth, colourFbo, colour: colour2 };
    return fine;
  }
  let RW = W2, RH = H, rfbo = null;
  const indexed = createIndexedPass({
    gl,
    quad,
    matTex,
    blocks,
    get width() {
      return W2;
    },
    get height() {
      return H;
    },
    get fbo() {
      return fbo;
    },
    get dataTex() {
      return dataTex;
    },
    get data2Tex() {
      return data2Tex;
    },
    get depthTex() {
      return depthTex;
    },
    counts: { get boxes() {
      return nBoxes;
    }, get wedges() {
      return nWedges;
    }, get capsules() {
      return nCaps;
    } }
  }, () => program(gl, FULLSCREEN_VS, DEPTH_FS));
  const { mode: bakeMode, pass, readTarget } = indexed;
  let rasterState = null;
  const rasterStats = { meshes: 0, triangles: 0, instances: 0, meshBytes: 0 };
  function rasterMode() {
    if (rasterState) return rasterState;
    const prog = program(gl, RASTER_VS, RASTER_FS);
    const depthOut = program(gl, FULLSCREEN_VS, DEPTH_OUT_FS);
    const kind = (t) => {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, t.verts, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      const nb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, nb);
      gl.bufferData(gl.ARRAY_BUFFER, t.norms, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, t.index, gl.STATIC_DRAW);
      const inst = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, inst);
      gl.bufferData(gl.ARRAY_BUFFER, 1024 * RASTER_FLOATS * 4, gl.DYNAMIC_DRAW);
      for (let k = 0; k < 4; k += 1) {
        gl.enableVertexAttribArray(2 + k);
        gl.vertexAttribPointer(2 + k, 4, gl.FLOAT, false, RASTER_FLOATS * 4, k * 16);
        gl.vertexAttribDivisor(2 + k, 1);
      }
      gl.bindVertexArray(null);
      return { vao, inst, cap: 1024, count: t.index.length };
    };
    const box2 = kind(boxTemplate());
    rasterState = { prog, depthOut, box: box2, wedge: kind(boxTemplate()), capsule: kind(capsuleTemplate(8, 2)), meshes: /* @__PURE__ */ new Map() };
    return rasterState;
  }
  function drawRaster(frame, eye, fwd, right, up, tanF, sunN, waterY, fogNear, fogFar, time) {
    const R = rasterMode();
    const RU = R.prog.loc;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.useProgram(R.prog.p);
    gl.uniform3fv(RU.uEye, eye);
    gl.uniform3fv(RU.uFwd, fwd);
    gl.uniform3fv(RU.uRight, right);
    gl.uniform3fv(RU.uUp, up);
    gl.uniform1f(RU.uTan, tanF);
    gl.uniform1f(RU.uAspect, RW / RH);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, matTex);
    gl.uniform1i(RU.uMats, 1);
    gl.uniform3fv(RU.uSun, sunN);
    gl.uniform1f(RU.uWaterY, frame.waterY ?? waterY);
    gl.uniform1f(RU.uFogNear, fogNear);
    gl.uniform1f(RU.uFogFar, fogFar);
    gl.uniform2f(RU.uRes, RW, RH);
    gl.uniform1f(RU.uTime, time);
    let tris = 0, insts = 0, meshes = 0;
    for (const key2 of frame.meshes ?? []) {
      const m = R.meshes.get(key2);
      if (!m || !m.count) continue;
      gl.uniform1i(RU.uKind, 0);
      gl.bindVertexArray(m.vao);
      if (m.indexed) gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
      else gl.drawArrays(gl.TRIANGLES, 0, m.count);
      tris += m.count / 3;
      meshes += 1;
    }
    const solids = frame.solids;
    if (solids) {
      for (const [k, buf, id] of [[R.box, solids.boxes, 1], [R.wedge, solids.wedges, 2], [R.capsule, solids.capsules, 3]]) {
        if (!buf.count) continue;
        gl.bindVertexArray(k.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, k.inst);
        if (buf.count > k.cap) {
          k.cap = Math.max(buf.count, k.cap * 2);
          gl.bufferData(gl.ARRAY_BUFFER, k.cap * RASTER_FLOATS * 4, gl.DYNAMIC_DRAW);
        }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf.data, 0, buf.count * RASTER_FLOATS);
        gl.uniform1i(RU.uKind, id);
        gl.drawElementsInstanced(gl.TRIANGLES, k.count, gl.UNSIGNED_SHORT, 0, buf.count);
        tris += k.count / 3 * buf.count;
        insts += buf.count;
      }
    }
    gl.bindVertexArray(null);
    rasterStats.meshes = meshes;
    rasterStats.triangles = tris;
    rasterStats.instances = insts;
    if (frame.draw) {
      frame.draw({ gl, eye: [eye[0], eye[1], eye[2]], forward: fwd, right, up, tan: tanF, width: RW, height: RH, far: FAR, time, sun: sunN });
      gl.bindFramebuffer(gl.FRAMEBUFFER, rfbo);
      gl.viewport(0, 0, RW, RH);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.depthMask(true);
    }
  }
  function writeDepthOut(map) {
    const R = rasterMode();
    const scale2 = map === true ? 1 : map.scale ?? 1, bias = map === true ? 0 : map.bias ?? 0;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.ALWAYS);
    gl.depthMask(true);
    gl.colorMask(false, false, false, false);
    const D = lastK > 1 ? smoothDepthOutP ??= program(gl, FULLSCREEN_VS, smoothDepthOutFs(DEPTH_OUT_FS)) : R.depthOut;
    gl.useProgram(D.p);
    gl.uniform2f(D.loc.uMap, scale2, bias);
    if (lastK > 1) gl.uniform1i(D.loc.uSS, lastK);
    pass(D.p, null, [[lastK > 1 ? fine.depth : depthTex, D.loc.uDepth]]);
    gl.colorMask(true, true, true, true);
    gl.disable(gl.DEPTH_TEST);
  }
  const api = {
    gl,
    get width() {
      return W2;
    },
    get height() {
      return H;
    },
    limits: {
      boxes: MAX_BOXES,
      wedges: MAX_WEDGES,
      capsules: MAX_CAPS,
      ramps: MAX_RAMPS,
      materials: MAX_MATERIALS,
      colours: MAX_COLOURS,
      fragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
      maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE)
    },
    setTarget(w, h) {
      if (activeProfile.kind === "hardware" && (w !== activeProfile.width || h !== activeProfile.height)) throw new RangeError(`${activeProfile.label} preview requires ${activeProfile.width} \xD7 ${activeProfile.height}`);
      target(Math.max(8, w | 0), Math.max(8, h | 0));
      if (activeProfile.kind === "native") authoredSize = [W2, H];
    },
    get profile() {
      return activeProfile;
    },
    setProfile(input) {
      const next = targetProfile(input);
      activeProfile = next;
      if (next.kind === "native") {
        target(authoredSize[0], authoredSize[1]);
        style = { ...authoredStyle };
      } else {
        target(next.width, next.height);
        style = { ...authoredStyle, screen: next.screen, dither: next.dither };
      }
      if (authoredPalette.length) api.setPalette(authoredPalette, authoredRamps);
      fxDirty = true;
    },
    setPalette(colours, ramps) {
      if (colours.length > MAX_COLOURS) throw new RangeError(`${colours.length} colours: at most ${MAX_COLOURS}`);
      const sourceColours = colours.map((c) => [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0]);
      if (activeProfile.kind !== "native") colours = adaptTargetPalette(sourceColours, activeProfile.id);
      palette = colours.map((c) => [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0]);
      const rows = Math.max(1, Math.ceil(colours.length / PALETTE_WIDTH));
      const bytes = new Uint8Array(PALETTE_WIDTH * rows * 4);
      colours.forEach((c, i) => {
        bytes[i * 4] = c[0] ?? 0;
        bytes[i * 4 + 1] = c[1] ?? 0;
        bytes[i * 4 + 2] = c[2] ?? 0;
        bytes[i * 4 + 3] = 255;
      });
      if (palTex) gl.deleteTexture(palTex);
      palTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, palTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, PALETTE_WIDTH, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      nearest();
      const entries = Object.entries(ramps);
      if (entries.length > MAX_RAMPS) throw new RangeError(`${entries.length} ramps: at most ${MAX_RAMPS}`);
      authoredPalette = sourceColours;
      authoredRamps = Object.fromEntries(entries.map(([name, slot]) => [name, [...slot]]));
      rampIndex = /* @__PURE__ */ new Map();
      rampList = entries.map(([name, [base, len2]], i) => {
        rampIndex.set(name, i);
        return [base, len2];
      });
      fxDirty = true;
    },
    get palette() {
      return palette;
    },
    ramp: (name) => rampIndex.get(name) ?? 0,
    setMaterials(list) {
      if (list.length > MAX_MATERIALS) throw new RangeError(`${list.length} materials: at most ${MAX_MATERIALS}`);
      matRows.fill(0);
      list.forEach((m, i) => {
        matRows.set([rampIndex.get(m.ramp) ?? 0, m.light ?? 1, m.pattern ?? 0, m.glow ?? 0], i * 4);
      });
      gl.bindTexture(gl.TEXTURE_2D, matTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.FLOAT, matRows);
    },
    setStyle({ screen: s = style.screen, dither: d = style.dither, outline: o = style.outline, edges: e = edges, supersample: k = supersample } = {}) {
      style = { screen: s, dither: d, outline: o ? 1 : 0 };
      edges = e;
      supersample = k;
      authoredStyle = { ...style };
      fxDirty = true;
    },
    setWorld(world) {
      const counts = uploadWorld(gl, blocks, world);
      nBoxes = counts.boxes;
      nWedges = counts.wedges;
      nCaps = counts.capsules;
      return counts;
    },
    setFx(list = []) {
      fxList = list.map((e) => ({ ...e }));
      resolveFx(fxList, { width: W2, height: H });
      fxDirty = true;
    },
    toggleFx(name, on) {
      fxList = toggleFx(fxList, name, on);
      fxDirty = true;
    },
    get fx() {
      return fxList.map((e) => ({ ...e }));
    },
    get fxResolved() {
      if (fxDirty) refreshFx();
      return fxResolved;
    },
    allFx: ALL_FX,
    get gpuMs() {
      return gpuMs;
    },
    get supersample() {
      return lastK;
    },
    render({ eye, target: look, fov = 1.2, time = 0, sun = [0.4, 0.8, 0.3], waterY = 0, fogNear = 25, fogFar = 110, particles = [], raster, depthOut }) {
      const { world, pixel, points } = colourPrograms();
      const fx = fxDirty || !fxU ? refreshFx() : fxU;
      let timing = false;
      if (timer) {
        if (query && gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
          if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) gpuMs = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
          gl.deleteQuery(query);
          query = null;
        }
        if (!query) {
          query = gl.createQuery();
          gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
          timing = true;
        }
      }
      const { forward: fwd, right, up } = cameraBasis(eye, look);
      const tanF = Math.tan(fov / 2);
      const sunN = norm3(sun);
      const k = edges === "smooth" && activeProfile.kind === "native" ? supersampleFor(W2, H, supersample) : 1;
      const F = k > 1 ? fineBuffers(k) : null;
      lastK = k;
      RW = F ? F.w : W2;
      RH = F ? F.h : H;
      rfbo = F ? F.fbo : fbo;
      gl.bindFramebuffer(gl.FRAMEBUFFER, rfbo);
      gl.viewport(0, 0, RW, RH);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.ALWAYS);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const U = world.loc;
      gl.useProgram(world.p);
      gl.uniform2f(U.uRes, RW, RH);
      gl.uniform3fv(U.uEye, eye);
      gl.uniform3fv(U.uFwd, fwd);
      gl.uniform3fv(U.uRight, right);
      gl.uniform3fv(U.uUp, up);
      gl.uniform1f(U.uTan, tanF);
      gl.uniform1f(U.uTime, time);
      gl.uniform1i(U.uBoxes, nBoxes);
      gl.uniform1i(U.uWedges, nWedges);
      gl.uniform1i(U.uCaps, nCaps);
      for (const blk of blocks) gl.bindBufferBase(gl.UNIFORM_BUFFER, blk.i, blk.buf);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, matTex);
      gl.uniform1i(U.uMats, 1);
      gl.uniform3fv(U.uSun, sunN);
      gl.uniform1f(U.uWaterY, waterY);
      gl.uniform1f(U.uFogNear, fogNear);
      gl.uniform1f(U.uFogFar, fogFar);
      if (raster?.world === false) {
        gl.clearBufferfv(gl.COLOR, 0, [0.5, (matRows[SKY_MAT * 4] ?? 0) / 255, SKY_MAT / 255, 1]);
        gl.clearBufferfv(gl.COLOR, 1, [0, 1, 0, 0]);
      } else {
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        const aw = gl.getAttribLocation(world.p, "aPos");
        gl.enableVertexAttribArray(aw);
        gl.vertexAttribPointer(aw, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      if (particles.length) {
        gl.depthFunc(gl.LESS);
        const data = new Float32Array(particles.length * 7);
        particles.forEach((q, i) => data.set([q.p[0], q.p[1], q.p[2], q.size ?? 1, q.light ?? 0.8, (q.ramp === void 0 ? void 0 : rampIndex.get(q.ramp)) ?? 0, q.glow ?? 0], i * 7));
        gl.useProgram(points.p);
        const P = points.loc;
        gl.uniform3fv(P.uEye, eye);
        gl.uniform3fv(P.uFwd, fwd);
        gl.uniform3fv(P.uRight, right);
        gl.uniform3fv(P.uUp, up);
        gl.uniform1f(P.uTan, tanF);
        gl.uniform1f(P.uAspect, RW / RH);
        gl.uniform1f(P.uH, RH);
        gl.bindBuffer(gl.ARRAY_BUFFER, pbuf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        const a0 = gl.getAttribLocation(points.p, "aPos");
        const a1 = gl.getAttribLocation(points.p, "aLook");
        gl.enableVertexAttribArray(a0);
        gl.vertexAttribPointer(a0, 4, gl.FLOAT, false, 28, 0);
        gl.enableVertexAttribArray(a1);
        gl.vertexAttribPointer(a1, 3, gl.FLOAT, false, 28, 16);
        gl.drawArrays(gl.POINTS, 0, particles.length);
        gl.disableVertexAttribArray(a1);
      }
      if (raster) drawRaster(raster, eye, fwd, right, up, tanF, sunN, waterY, fogNear, fogFar, time);
      gl.disable(gl.DEPTH_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, F ? F.colourFbo : null);
      gl.viewport(0, 0, RW, RH);
      const pass2 = F ? raster?.draw ? smoothDirectP ??= program(gl, FULLSCREEN_VS, smoothPixelFs(DIRECT_PIXEL_FS)) : smoothPixelP ??= program(gl, FULLSCREEN_VS, smoothPixelFs(PIXEL_FS)) : raster?.draw ? directPixelP ??= program(gl, FULLSCREEN_VS, DIRECT_PIXEL_FS) : pixel;
      gl.useProgram(pass2.p);
      const X = pass2.loc;
      const T = [[F ? F.data : dataTex, "uData"], [F ? F.data2 : data2Tex, "uData2"], [F ? F.depth : depthTex, "uDepth"], [palTex, "uPalette"], [rampTex, "uRamps"], [screenTex, "uScreenTex"]];
      T.forEach(([t, name], i) => {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.uniform1i(X[name], i);
      });
      const u = fx.u;
      gl.uniform1i(X.uScreen, u.uScreen);
      gl.uniform1f(X.uDither, u.uDither);
      gl.uniform1f(X.uTime, time);
      gl.uniform3fv(X.uOutline, u.uOutline);
      gl.uniform1i(X.uOutlineInk, u.uOutlineInk);
      gl.uniform4fv(X.uFog, u.uFog);
      gl.uniform2fv(X.uFogLook, u.uFogLook);
      gl.uniform4fv(X.uGlow, u.uGlow);
      gl.uniform2fv(X.uGlowK, u.uGlowK);
      gl.uniform4fv(X.uVig, u.uVig);
      gl.uniform4fv(X.uScan, u.uScan);
      gl.uniform4fv(X.uCrt, u.uCrt);
      gl.uniform4fv(X.uRim, u.uRim);
      let rd = u.uRimDir;
      if (!rd) {
        const sx = dot2(sunN, right);
        const sy = dot2(sunN, up);
        const l = Math.hypot(sx, sy);
        rd = l > 1e-3 ? [sx / l, sy / l] : [0, 1];
      }
      gl.uniform2fv(X.uRimDir, rd);
      gl.uniform4fv(X.uFlash, u.uFlash);
      gl.uniform4iv(X.uFlashMats, u.uFlashMats);
      gl.uniform2fv(X.uGrade, u.uGrade);
      gl.uniform1i(X.uCycle, u.uCycle);
      if (F) gl.uniform1i(X.uSS, k);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      const ap = gl.getAttribLocation(pass2.p, "aPos");
      gl.enableVertexAttribArray(ap);
      gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (F) {
        const rp = resolveP ??= program(gl, FULLSCREEN_VS, RESOLVE_FS);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, W2, H);
        gl.useProgram(rp.p);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, F.colour);
        gl.uniform1i(rp.loc.uColour, 0);
        gl.uniform1i(rp.loc.uSS, k);
        const ar = gl.getAttribLocation(rp.p, "aPos");
        gl.enableVertexAttribArray(ar);
        gl.vertexAttribPointer(ar, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      if (depthOut) writeDepthOut(depthOut);
      if (timing && timer) gl.endQuery(timer.TIME_ELAPSED_EXT);
    },
    read() {
      const out = new Uint8Array(W2 * H * 4);
      gl.readPixels(0, 0, W2, H, gl.RGBA, gl.UNSIGNED_BYTE, out);
      return out;
    },
    readData() {
      const x = bakeMode();
      const data = readTarget(fbo, gl.COLOR_ATTACHMENT0);
      const data2 = readTarget(fbo, gl.COLOR_ATTACHMENT1);
      gl.disable(gl.DEPTH_TEST);
      pass(x.depth.p, x.fb, [[depthTex, x.depth.loc.uDepth]]);
      const packed = readTarget(x.fb, gl.COLOR_ATTACHMENT0);
      const depth = new Float32Array(W2 * H);
      for (let i = 0; i < depth.length; i += 1) depth[i] = unpackDepth(packed[i * 4], packed[i * 4 + 1], packed[i * 4 + 2]);
      return { width: W2, height: H, data, data2, depth };
    },
    renderIndexed: indexed.renderIndexed,
    readIndexed: indexed.readIndexed,
    renderIndexedHeights: indexed.renderIndexedHeights,
    setMesh(key2, mesh) {
      const R = rasterMode();
      const old = R.meshes.get(key2);
      if (old) {
        for (const b of old.bufs) gl.deleteBuffer(b);
        gl.deleteVertexArray(old.vao);
        R.meshes.delete(key2);
        rasterStats.meshBytes -= old.bytes;
      }
      if (!mesh) return;
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const bufs = [];
      const attr = (loc, data, size) => {
        const b = gl.createBuffer();
        bufs.push(b);
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      };
      attr(0, mesh.positions, 3);
      attr(1, mesh.normals, 3);
      attr(2, mesh.looks, 4);
      for (let k = 3; k < 6; k += 1) {
        gl.disableVertexAttribArray(k);
        gl.vertexAttrib4f(k, 0, 0, 0, 0);
      }
      let bytes = mesh.positions.byteLength + mesh.normals.byteLength + mesh.looks.byteLength;
      if (mesh.indices) {
        const b = gl.createBuffer();
        bufs.push(b);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
        bytes += mesh.indices.byteLength;
      }
      gl.bindVertexArray(null);
      R.meshes.set(key2, { vao, bufs, count: mesh.indices ? mesh.indices.length : mesh.positions.length / 3, indexed: !!mesh.indices, bytes });
      rasterStats.meshBytes += bytes;
    },
    get rasterStats() {
      return { ...rasterStats };
    },
    offPalette(pixels = api.read()) {
      const set = new Set(palette.map((c) => c[0] << 16 | c[1] << 8 | c[2]));
      let off = 0;
      for (let i = 0; i < pixels.length; i += 4) if (!set.has((pixels[i] ?? 0) << 16 | (pixels[i + 1] ?? 0) << 8 | (pixels[i + 2] ?? 0))) off += 1;
      return off;
    }
  };
  if (profile2 !== void 0) api.setProfile(profile2);
  return api;
}
export {
  createPixelRenderer
};
