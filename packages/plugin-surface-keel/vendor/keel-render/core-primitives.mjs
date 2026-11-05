
// packages/core/src/dmath.ts
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

// packages/core/src/frame.ts
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

// packages/core/src/math.ts
var TAU = Math.PI * 2;
var fract = (v) => v - Math.floor(v);
var tri = (v) => 1 - Math.abs(2 * fract(v) - 1);

// packages/core/src/curl.ts
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

// packages/core/src/palette.ts
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

// packages/core/src/look.ts
var DRAWS = new Float64Array(16);
var WEIGHTS = [1, 0.8, 0.5];
var W_NORM = Math.sqrt(WEIGHTS.reduce((a, b) => a + b, 0));

// packages/core/src/dither.ts
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

// packages/core/src/quantize.ts
var BAYER4Q = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

// packages/core/src/gif.ts
var DICT = new Int32Array(1 << 17).fill(-1);
var DICT_TOUCHED = new Int32Array(1 << 12);

// packages/core/src/targets.ts
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

// packages/render/src/fx.ts
var FX_ORDER = ["crt", "grade", "fog", "glow", "rim", "flash", "vignette", "scanlines", "dither", "outline", "cycle"];
var scalePx = (v, side, min = 1, max = 64) => Math.max(min, Math.min(max, Math.round(v * side / 128)));
var GRADE_PRESETS = { day: { shift: 0 }, dusk: { shift: -0.6 }, night: { shift: -1.4 } };

export {
  FX_ORDER,
  GRADE_PRESETS,
  SCREENS,
  adaptTargetPalette,
  cameraBasis,
  scalePx,
  screenForTarget,
  targetProfile,
};
