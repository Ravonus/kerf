import './effects-world.mjs';
import {
  FAR,
  PALETTE_WIDTH,
  SCREEN_TILE,
  WATER_MAT,
  WORLD_FS,
} from './effects-world.mjs';

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

// packages/render/src/indexed.ts
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

// packages/render/src/raster.ts
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

// packages/render/src/smooth.ts
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

export {
  BAKE_WORLD_FS,
  DEPTH_FS,
  DEPTH_OUT_FS,
  DIRECT_PIXEL_FS,
  HEIGHT_FS,
  INDEX_FS,
  PIXEL_FS,
  RASTER_FLOATS,
  RASTER_FS,
  RASTER_VS,
  boxTemplate,
  capsuleTemplate,
  smoothDepthOutFs,
  smoothPixelFs,
  unpackDepth,
};
