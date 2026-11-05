import './core-primitives.mjs';
import {
  FX_ORDER,
  GRADE_PRESETS,
  SCREENS,
  scalePx,
  screenForTarget,
} from './core-primitives.mjs';

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
function toggleFxList(list, name, on) {
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
function colourEntry(c, ramp2, look) {
    if (c == null) return -1;
    if (typeof c === "number") return c;
    const r = ramp2(c.ramp);
    if (r < 0) return -1;
    const [base, len2] = look.rampOf(r);
    return base + Math.max(0, Math.min(len2 - 1, c.index < 0 ? len2 + c.index : c.index));
  }

function fxUniforms(resolved, look) {
  const on = {};
  for (const p of resolved) if (p.on) on[p.name] = p.params;
  const ramp2 = (r) => typeof r === "number" ? r : look.ramp(r);
  const entry = (c) => colourEntry(c, ramp2, look);
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

// packages/render/src/shaders.ts
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

export {
  ALL_FX,
  FAR,
  FULLSCREEN_VS,
  MAX_BOXES,
  MAX_CAPS,
  MAX_COLOURS,
  MAX_MATERIALS,
  MAX_RAMPS,
  MAX_WEDGES,
  PALETTE_WIDTH,
  POINTS_FS,
  POINTS_VS,
  SCREEN_TILE,
  SKY_MAT,
  WATER_MAT,
  WORLD_FS,
  fxUniforms,
  resolveFx,
  screenTile,
  toggleFxList,
};
