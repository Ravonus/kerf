// ../../../../../../keel-engine/packages/core/src/color.ts
function srgb8ToLinear(byte) {
  const value = byte / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

// ../../../../../../keel-engine/packages/core/src/rng.ts
var HEX_SEED = /^0x[0-9a-f]{64}$/u;
function normalizeSeed(value) {
  const clean = String(value ?? "").toLowerCase().replace(/^0x/u, "");
  if (!/^[0-9a-f]+$/u.test(clean) || clean.length > 64) {
    throw new TypeError("Seed must be one to sixty-four hexadecimal digits.");
  }
  const seed = `0x${clean.padStart(64, "0")}`;
  if (!HEX_SEED.test(seed)) throw new TypeError("Seed must resolve to bytes32.");
  return seed;
}
function seedBytes(seed) {
  const clean = normalizeSeed(seed).slice(2);
  const bytes2 = new Uint8Array(32);
  for (let at = 0; at < 32; at += 1) bytes2[at] = Number.parseInt(clean.slice(at * 2, at * 2 + 2), 16);
  return bytes2;
}
function expand(bytes2, slot) {
  let state = 2166136261;
  for (const byte of bytes2) state = Math.imul(state ^ byte, 16777619) >>> 0;
  for (let shift = 0; shift < 32; shift += 8) {
    state = Math.imul(state ^ slot >>> shift & 255, 16777619) >>> 0;
  }
  state = (state ^ state >>> 15) >>> 0;
  return state & 65535;
}
function draw(entries, ticket) {
  for (const [value, weight] of entries) {
    if (ticket < weight) return value;
    ticket -= weight;
  }
  return entries[entries.length - 1][0];
}
var totalOf = (entries) => {
  let total = 0;
  for (const [, weight] of entries) total += weight;
  return total;
};
function createRoll(seed) {
  const bytes2 = seedBytes(seed);
  const words = new Uint16Array(16);
  for (let at2 = 0; at2 < 16; at2 += 1) words[at2] = bytes2[at2 * 2] << 8 | bytes2[at2 * 2 + 1];
  const at = (slot) => slot < 16 ? words[slot] : expand(bytes2, slot);
  const api = {
    seed: normalizeSeed(seed),
    at,
    /** Uniform-enough over a 16-bit draw: every table here is far under 256 wide. */
    pick: (slot, list) => list[at(slot) % list.length],
    index: (slot, length) => at(slot) % length,
    range: (slot, low, high) => low + at(slot) % (high - low + 1),
    chance: (slot, numerator, denominator = 100) => at(slot) % denominator < numerator,
    weighted: (slot, entries) => draw(entries, at(slot) % totalOf(entries)),
    /** A private stream off one slot: sub(slot).next() walks its own words. */
    sub(slot) {
      let cursor = 0;
      const base = 65536 + slot * 4096;
      const next = () => expand(bytes2, base + cursor++);
      return {
        next,
        index: (length) => next() % length,
        pick: (list) => list[next() % list.length],
        range: (low, high) => low + next() % (high - low + 1),
        chance: (numerator, denominator = 100) => next() % denominator < numerator,
        weighted: (entries) => draw(entries, next() % totalOf(entries))
      };
    }
  };
  return api;
}
function stream(roll, slot) {
  const sub2 = roll.sub(slot);
  const f = () => sub2.next() / 65536;
  return {
    f,
    between: (a, b) => a + (b - a) * f(),
    int: (a, b) => a + Math.floor(f() * (b - a + 1)),
    pick: (list) => list[Math.floor(f() * list.length)],
    chance: (p) => f() < p,
    // (The total is summed before the draw, as the original does: the draw order is part of the stream.)
    weighted: (entries) => {
      const total = totalOf(entries);
      return draw(entries, f() * total);
    }
  };
}
function deriveSeed(seed, label) {
  let h = 2166136261;
  const text = `${seed}:${label}`;
  let hex2 = "";
  for (let w = 0; w < 8; w += 1) {
    for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
    h = Math.imul(h ^ w, 16777619) >>> 0;
    hex2 += (h >>> 0).toString(16).padStart(8, "0");
  }
  return `0x${hex2}`;
}

// ../../../../../../keel-engine/packages/core/src/dmath.ts
var F64 = new Float64Array(1);
var U32 = new Uint32Array(F64.buffer);
F64[0] = 1;
var HI = U32[1] === 1072693248 ? 1 : 0;
var LO = 1 - HI;

// ../../../../../../keel-engine/packages/core/src/frame.ts
var FRONT = Object.freeze([0, 0, 1]);
var RIGHT = Object.freeze([1, 0, 0]);
var UP = Object.freeze([0, 1, 0]);

// ../../../../../../keel-engine/packages/core/src/math.ts
var TAU = Math.PI * 2;
var clamp = (v, a, b) => v < a ? a : v > b ? b : v;
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
function oklabToLinear(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
}
var inGamut = (rgb) => rgb.every((c) => c >= -5e-4 && c <= 1.0005);
var encode = (c) => {
  const v = clamp(c, 0, 1);
  return Math.round(255 * (v <= 31308e-7 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
};
var encodeRgb = (rgb) => [encode(rgb[0]), encode(rgb[1]), encode(rgb[2])];
function oklch(L, C, hueDeg) {
  const h = hueDeg * Math.PI / 180;
  let rgb = oklabToLinear(L, C * Math.cos(h), C * Math.sin(h));
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = C;
    for (let step = 0; step < 18; step += 1) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklabToLinear(L, mid * Math.cos(h), mid * Math.sin(h)))) lo = mid;
      else hi = mid;
    }
    rgb = oklabToLinear(L, lo * Math.cos(h), lo * Math.sin(h));
  }
  return encodeRgb(rgb);
}
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
var accentRamp = (S, hue2, extra = {}) => ({
  hues: [hue2 - 6, hue2 + 6],
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
    const [u2, v] = coords(x, y);
    return -(Math.cos(2 * Math.PI * u2) + Math.cos(2 * Math.PI * v));
  };
  const tie = (x, y) => {
    const [u2, v] = coords(x, y);
    const [i, j] = [Math.round(u2), Math.round(v)];
    const dx = x - (i * ax + j * bx);
    const dy = y - (i * ay + j * by);
    const oct = Math.floor((Math.atan2(dy, dx) + 2 * Math.PI) % (2 * Math.PI) / (Math.PI / 4) + 1e-9) & 7;
    return ALONG[oct];
  };
  return equalize(shape, w, h, tie);
}
var BLUE_NOISE = (() => {
  const s = atob("5mkewUkqf948qxhk/1Z7InJdnyjRPMYG7J5vuSVFfs4icUOTeFyxR58dPbIYZuANoGHAbEzFDJw5+ljabO1AJ643o3lg9rRoBovgpDXGlNyt+kC2evOhaYJS+QPXqpU1uO3UK/Ib4Qf4wG7wUJM5tydE9Bi0eVrYHHQqnBKOt3fNj+sA2xmZT9EsSXQdqwxOMRJu2AlWHjPQFT2GZ+RWCGaHD1SdvYFlky2LBMSp/VvIepgujv9BrIzJsuZPxRlKDFgut0SHMu16vfaQ12LtiM6X7UqRr+C+keOkxy8YwP+hPa/fa0Ex0kzmW9omcBCD5gjbX9EAKOZgRQlqNf6A4mn1gtNvrccOnh9bAblFI3C2XB3DLWR9Q14ic1HqjHVKzRl8yAD8qRC2G6N6ONBKpTRUsT2mb8OCFfaV1apgK6E6mhBQJP1cQWzdrjzogMT3BDuBoOoX/AGo8boSnzyxJZHwWimWUIXsb8tD+bWN7yK/i/gaheFJojO9eiGIArjbILPG4qESkum4MYpvEZkyVafR43FIs47TLoNG2GLzA+BtN7Tlc8QhW5owiQxhF1fechBqyixZEfJm21Q+7NBIdY1hQH1nN89/B1X70ahf1xyKZSgQyjJuUMFmCZInxoRY1BOgQxbZO7IE8lLZqsmYP6LXRa3pmrqJJKcMsVyYE/nLBe4orOZOJqLHG0cp7Hq0P/68k1vcohblm/qwdUOpMLx++mGIneh402S7JHUyfgLwL5JiC3Y1yUl0/McufbtSMNiUvAuKwXbwZZR/vU4O358HS+18C/VAfCU6VuIO95dNBs0tvA5OKow9n+NK9s9ktVXHIfxH2QPknByMbfEhpYRDcVP0XxpC3DCyC/dsyS9cd7E2pymMtF/dvhXMgGEf6W2aU+1rrfrFG3AJkhedKYIR4Im6p4NptFg71wZF3mix/xehOdCzmARU1j+jIZaD684e2mXDTs8NoYVrmS6xxYo9tRnSPoAIWKnst2DBUNX6pUFpMFYX9CuR72SuxZQPWyjF3nwkavx9v2iH41e6RRSbVYoD6nYy/Ukg8EHnTwzWKvR1kSThldgmRIQz5ng9IHHCBOXOm0LTEcAnf1Q06buKTQGU5kYVpyjvETLNAPVxOcH6Qp8crolnxqcA0mihelqlAsBMtDVkfMz3HqIGs49Y7ZV6I2CucIRPpuwcz3I98ahiNa3EWN+PTZ10q2OO3KgnZ4HUWeUH1y9ZeY8p/hrcQuVg/HAV7qUBV5DXYvHJFDSuSO/CC/4y4ABojaEIfxnTdu4RinE60B7H/kDVLFEN5rMQNr9xQJO49xeswEiJu5cxhA2eyE+9OnK/RyuBSp7VZRCHOZNSuZbLNvpM2GebLbpI2Cv4B3qxVg1/GJ/EdYxM9JAfpPMUf0ngN1/sCWkgy6xF138ljeKeE/+pDeR2I/u13GnPIXYVSXu7JK43/FYJgaJhlLzqYy6WuuJe+jy8JaFq20/FYiedbckgeKXTVHLyHF43+BFjLcyFark4wlGQLksDquRd8ajcClnnF42qxvIbz0sYP4fS7WtJJIYF4FrPOwF+Mq3s0wSHst4/K+oEirvfl7d1pulZPyHuXYYSzW6f9n8zw4gnZZ6Kx0vWbyZdOnuu4J0jqwU4krLRbqcZern9l+MNiztb+00OkLV9o0kuawhSyEYFsZHVmgDgou8cv1YZmkYNuT73L3O4A0Hdmb3rAVp0+099wfURTu82lutQKmfMU3Cowi+ga/FX2SHK/rCE7yDXfvMYc0yyNGNGgTngccrzV+J5xBHlXp71hQ5tLI3WNLcb3l8sooIgwmYJjrAaP7si8BB80ibAEjpqj1cXQKA0k187wSz7e8ghrdSUCbMoZ6qOHU6khiHLLk+t/0emEsdlkKRE5W3MWqriR9l385t63kyXYudGi3j1qwvmeMLcbb4U355k0BWR8nQSXfmGQdEFNdVo8DvdeGPDH9Be43lL7wrVIYkB9zoQgyzGEVbVA480zB6vAaXWTb0005clVAf7qk2IC0KlVDe93UmjH+t7nP62ggyxkgjvnII3kxqzKYY6c6zGS5eycvCZXac4tyln/7mDWPcwYBWVdUhj9KiMMXki7LDccOcEZ5svyWusUBdeQibHVUasGEPdBL5q+Zvav1X7MGffKNFAuB75cIfkpVIKPtpzmsfjKe8Dtho/513Vu2sygx+3jf4XeegHOOHDlOagc/iH5XG2XHroPlEHYh6UDYG4E5BXBGqO1AlExRt865MltQxCbIbDoYDObsQUmkIC+E7LXz2sUbyRYLWIKWwA0TIcYDjNKvKXJqnSgLbpQcha7j93/sHiLlCb62Ew061pxlGJ8aoZTjjiUiqGrVLkkcSgDtoof+AlQPQQ10byhVew2sKZGoNJDslvG/MteKjcJp3Qrx2fRH7KsxWDn0oQNvoW3TNbzfVoEZn9Bt4teB5aNXXuk8IGb82ifVWpFbw+kwpLaf2k1rFZOYuiSF4CiGwRUzJmiAztIGU7+7ly6I9dnXm6CJV7JbrUdEG+YvOz1oiwFmVJ95tXMh7Hb90n+m3nLLoCVi9z9tu5FN+88TnD44/xvt5bqXOU2VUB1yi/RM8jathAs+aHMlylkBiDRQn8S8wzqHwT3rf9jjebWoIUpovsd92QHZoFTWmEIZhOryl7BUcmzTL3EsMtjmCmgAbnr0z+KmAATKwP2O84zqVkKnCX6iHQQYhkBUrqC861RtRfPBe0R843e8X9NNVwC/dj16C0dpBSu0J9q+8/GPZuNo8OgqPTkfi/dyhQbhDskdq8AF22au8nrdR5p2Q08HMgrcqC9Wes7V6hD6xYxoakPR1Z+RXnBJ9j6QtszbJPnMle7cVxGDxpHOiGyJe7VSA+fuFHjA/CUpgZ5CfDhg+a5QiWTyoHhBbhKI1F7hYx5XnNlTFpr4XeI9BPmCaF2C0WqT4fTt6pylSePgX/M3bMrhahKvSlNnjMPVmT+0qxWDP5ZeO/nUK2UdB33GqZulITtkbawh1NNHWnN8L5DmTyftFtvJf1CYkt1rhdrRyL6F/6a9JTgOII+Gy8AnIi4M5/tR86dtHzbpM6AbYiP9Ru/4wAg17zmMf9GI5beUa4k00C6S9+Xjhw6xRsgd9Ong1FMJIKxB9gsY0rqNs3n2MVQnHakhNaLhvC7qNc9n4Iqytg6yamPHsIZrHrBNukHjbfoFiwEdfEspRG9SA5zWzBq9x2tECc1koX5kZ8yO+Lw6IAUr3/poneYBOFSsGS5EvPo75Q4xa82VQ7fyzKaunAdCiD90SNJFIG0J+7iAP4I4JOGeVm+TF0yWKcHVcKSizzmSd8Qwq1N3ivK9kONWYedzoTec1qiyqc5L2WQhGJXAvYvRxv5KD9g2YuUOOwWTvumsgthQKPpvIKvuqVuHjWX7Lty2rbVPDJR/yZcrL0nN+P9povs0n4EHAaWvGiS/+rPpZTzA5iM9oZyXkXb5bSagpcrOtRxSNCgDVuKPwThD4OjTUbhZskBIliH8xUFsNXB2ZG6gxhxahK1nzCMNIZf2boMah8u0uvkvGpQusuE6rdNnge1G20WN+Q0Udlo8Hhclyp6b5AcaThvD3pikJ/L6vWI6TckTeB7yauAm2PtSrIBYz5IuACdD1bCIzItX5Eivu/nT4P/6AYugKr2zNUJMb7SgVh1fg0Vg95rAOiz/xwwIZRdCDQCGWUO/lV3kH0Ua9uQ1yVyvYjv9ljH0/yyyVTB2XijnoxaPVTfhuS8J87HZC4Kn0Wsc+V9C9o5SBPDzzyBLD+R7nhUsZ+IaMKdJ3aGM61L4ZPpIIy/J53AGeWuIDMTSK72EOLJsrpbAV8r9lo5J3ITIdkHUjWtliVe7mbXssvmGyFIqMN57dfzociOfB+C+hmEuJtDbg+4qk15xz0L63rVwen5bJhP75N0F8LgzlVCeow26Rwiw45x+0u2xqB51QS7TjXa0STL+RIvWeWU6ZDxq840JlZhRXUUbB1RZ8Ma5LKdhY2hhKb+C2h7iWr+nWZwQ/8JcDygBdnSoyraD+1zp5ds4kW83IPrOoAxCv6diKK9U0d7sssbI0K2V2H0zz5K0qe9M63chyJUMFv1Rq5PF2ATq5gQ5nSpwLjJ8cMjyh1Afssv1HJl1l9QdqNENSdXgd9v2hDl7v+P8AX57Mff77fWW8KUdc83xM1lkVjjiPjnjHSCucpVf1zt1j2fNXvO8VOmXbdHzb9FadvWrlLNObKoSqrBehaJH6ZMXJQm2EDqh2R4SygfrT/d+IFy/BwyADujWmleb4cNoVDoCBMYaOE5A87pmW3hdIt8xzhdLAZbT33itd7FKbhY/fLDe7ZRYT9QK5m8wJhyCmvWZwTSKhVdz3EGNpFj8zsCsRusgjbHlyx9owD5ERhwJo+iAT/jlXcFl5IuDfSSwKqQIonunDRLcN7Gr5DjKVNgvY1voct2boh9lmVCa5dJpXjM/+QvjFv0SNSwXQjkAlTzaZexSScuXfOI/JsiL0qe8NapjgPmmMI7laW2x/lDNMbdd5c/RWSZakz5Wz4fNxIW4AbRHjwoEKA6TOj8bTcdSXqOH1I7TUBr42gCljolPMR4Hf2U+iySKHUMnNbO7pmlUSkB7N6ReIGg8ZMGzq0E6TA2a5UFMoGl2DTDUxrMfeED7TfFMuCUftkLt2zHDZoSZgdyY0ZdcwjgQv5m4TxMMrsJWnSM6DJVbclotaKynLuAWcn6Itk+bYZfZvKG6pJwphuU6ViluAdRMSBQXfYpc8wYqpB3zSR61HGtRetcQFTgMGPTOoYa/o/d+gFYyNQjz+dfcc5rEwu4kD+WYrWA2E21CvxCjC/eKPqEpnxVgVz/LoJg1/AAGk6jmJHItSathQ69QywiCuaE5JSvZz80i3E+E0J2x56wpBtJro5duOm+xmBxXKwTdgHa1PLGrDFJoFO1PApmP6r4SfM51c3/WXhqFpzzlbnv9pn9CxAeBGnYhu4kW2e61cA0akM7JQpVIu1S5U5+RqJOrf+M4RDkOk8nCBxrkZXFHKeBnyoiRpGeinbnB1BewE4sBqE3bdT64bhM1j1PhOw30WCX8dIEs1xBtkg5GOiVeOTHqpu1WEUtuFbyA3ThbvZNPS/EOm+lMsEhjb7tqJci89HpAtoljkGdK7RJMSHaSyV8h9zn/W5POlXqn0I07wne1/dDPMroW8DjjV59TwaW5JLaD1xLF3xrU/IZg7V7CVu8FrG9iLWwEiYEHunUPzJFlOv2jBkgiKYastEkjZr7AHBPpi5Vsz6R73mpiSX6neyJNiYz6kSO23oJJR2MEudtBWRNH9Mq2v+K91j5Qs4o3a9PIwD5k+s/Q4puPQSnEmo91Ehhzp9H5ZkFk1ow0fODfiBBlD7h9WdD7tW8sOEB9NB57wC5IwUW4izRCjNjl3oD/hcpMIUzziJ2HRZ3YDPK4tz0uoGp94x7oHQrwOIMaNewA==");
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
  const unit2 = [[0, 1, 0], [45, 1, 1], [90, 0, 1], [135, -1, 1]].map(([a, dx, dy]) => [a, corr(dx, dy)]);
  const top = Math.max(...unit2.map(([, r]) => r));
  return {
    levels,
    maxBin,
    period: +Math.hypot(best.dx, best.dy).toFixed(2),
    angle: +angle.toFixed(1),
    r: +best.r.toFixed(2),
    // (Every direction within a hair of the smoothest counts: a crosshatch runs both diagonals.)
    lines: unit2.filter(([, r]) => r > top - 0.02).map(([a]) => a)
  };
}
var SCREEN_GEOM = Object.fromEntries(SCREEN_IDS.map((id2) => {
  const m = measureScreen(SCREENS[id2].at);
  return [id2, { period: m.period, angle: m.angle, r: m.r, lines: m.lines }];
}));

// ../../../../../../keel-engine/packages/core/src/quantize.ts
var BAYER4Q = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

// ../../../../../../keel-engine/packages/core/src/gif.ts
var DICT = new Int32Array(1 << 17).fill(-1);
var DICT_TOUCHED = new Int32Array(1 << 12);

// ../../../../../../keel-engine/packages/core/src/targets.ts
var preset = (id2, label, kind, width, height, paletteLimit, channelBits, screen, hardware = null) => Object.freeze({ id: id2, label, kind, width, height, paletteLimit, channelBits, screen, dither: screen ? 0.9 : 0, hardware });
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

// ../../../../../../keel-engine/packages/ui/src/color.ts
var rgba = (r, g, b, a = 255) => (a << 24 | b << 16 | g << 8 | r) >>> 0;
var rgbOf = (c) => [c & 255, c >>> 8 & 255, c >>> 16 & 255];
var fromRgb = (rgb) => rgba(rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0);
var fromOklch = (L, C, h) => fromRgb(oklch(L, C, h));
var toHex = (c) => `#${rgbOf(c).map((v) => v.toString(16).padStart(2, "0")).join("")}`;
function luminance(c) {
  const [r, g, b] = rgbOf(c);
  return 0.2126 * srgb8ToLinear(r) + 0.7152 * srgb8ToLinear(g) + 0.0722 * srgb8ToLinear(b);
}
function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ../../../../../../keel-engine/packages/ui/src/raster.ts
function ellipse(cx, cy, rx, ry = rx, segments = 0) {
  const n = segments || Math.max(12, Math.ceil(Math.max(rx, ry) * 4));
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const a = i / n * Math.PI * 2;
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return out;
}

// ../../../../../../keel-engine/packages/ui/src/genfont.ts
var SERIFS = ["none", "slab", "foot"];
var ZEROS = ["plain", "dot", "slash"];
var SOFTS = ["all", "top", "bottom"];
var DEFAULT_FONT_RANGES = { width: [0.52, 0.86], xHeight: [0.56, 0.8], round: [0, 1, 2], stroke: [0.08, 0.22], serif: [["none", 3], ["slab", 2], ["foot", 1]], slant: 0.15, tracking: [1, 2] };
function fontParamsOf(S, ranges = DEFAULT_FONT_RANGES, pins = {}) {
  const drawn = {
    width: round2(S.between(ranges.width[0], ranges.width[1])),
    xHeight: round2(S.between(ranges.xHeight[0], ranges.xHeight[1])),
    descender: round2(S.between(0.2, 0.34)),
    round: S.pick(ranges.round),
    stroke: round2(S.between(ranges.stroke[0], ranges.stroke[1])),
    serif: S.weighted(ranges.serif),
    slant: S.chance(ranges.slant) ? 1 : 0,
    tracking: S.pick(ranges.tracking),
    zero: S.pick(ZEROS),
    ascend: S.chance(0.4) ? 1 : 0,
    soft: S.weighted([["all", 3], ["top", 1], ["bottom", 1]]),
    capWidth: S.chance(0.3) ? 2 : 0
  };
  return { ...drawn, ...pins };
}
var round2 = (v) => Math.round(v * 100) / 100;
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

// ../../../../../../keel-engine/packages/ui/src/theme.ts
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

// ../../../../../../keel-engine/packages/ui/src/frames.ts
var FRAME_KINDS = ["panel", "button", "inset", "tooltip", "badge", "tab", "header"];

// ../../../../../../keel-engine/packages/ui/src/icons.ts
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

// ../../../../../../keel-engine/packages/ui/src/node.ts
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

// ../../../../../../keel-engine/packages/ui/src/driving.ts
var TAU2 = Math.PI * 2;

// ../../../../../../keel-engine/packages/ui/src/gauges.ts
var GLYPH_BYTES = 128 * 1024;

// ../../../../../../keel-engine/packages/ui/src/prompts.ts
var DEFAULT = { face: rgba(26, 32, 52), rim: rgba(150, 170, 210), ink: rgba(240, 244, 255), lit: rgba(255, 190, 70) };

// ../../../../../../keel-engine/packages/codec/src/bits.ts
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

// ../../../../../../keel-engine/packages/codec/src/schema.ts
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
function extend(base, fields) {
  if (base.kind !== "struct") bad("extend() takes a struct.");
  if (!base.open) bad("Only an open struct can be extended: declare it struct({...}, { open: true }) from its first version.");
  const group = fieldsOf(fields, "extend");
  if (!group.length) bad("extend() needs at least one field.");
  const names = new Set([...base.fields, ...base.ext.flat()].map((f) => f.name));
  for (const f of group) {
    if (names.has(f.name)) bad(`extend(): the struct already has a field ${f.name}.`);
    if (f.type.kind !== "optional" && f.type.kind !== "default") bad(`extend(): new field ${f.name} must be optional() or withDefault() (old data doesn't carry it).`);
  }
  return node({ kind: "struct", fields: base.fields, open: true, ext: Object.freeze([...base.ext, Object.freeze(group)]) });
}
var tuple = (items) => node({ kind: "tuple", items: Object.freeze(items.map(asNode)) });
function union(tag, variants, { capacity = 0 } = {}) {
  const list = fieldsOf(variants, "union");
  if (!list.length) bad("A union needs variants.");
  for (const v of list) {
    if (v.type.kind !== "struct") bad(`Union variant ${v.name} must be a struct.`);
    const st = v.type;
    if ([...st.fields, ...st.ext.flat()].some((f) => f.name === tag)) bad(`Union variant ${v.name} has a field called ${tag}, its tag.`);
  }
  if (capacity && capacity < list.length) bad(`Union capacity ${capacity} is below its ${list.length} variants.`);
  return node({ kind: "union", tag, variants: Object.freeze(list), capacity: whole(capacity, 0, 2 ** 16, "union capacity") });
}
function alt(of) {
  if (of.length < 2) bad("alt() takes two or more types.");
  const cats = of.map((t) => categoryOf(asNode(t)));
  const seen = /* @__PURE__ */ new Set();
  for (const c of cats) {
    if (c === "any") bad("alt() branches must have a definite category (not dyn, optional or a recursion).");
    if (seen.has(c)) bad(`alt() has two ${c} branches: nothing tells them apart.`);
    seen.add(c);
  }
  return node({ kind: "alt", of: Object.freeze(of.map(asNode)) });
}
var planes = (bits) => node({ kind: "planes", bits: whole(bits, 1, 32, "planes bits") });
var named = (name, of, { version = 1, doc = "" } = {}) => node({ kind: "named", name: name || bad("named() needs a name."), version: whole(version, 0, 2 ** 32, "version"), doc, of: asNode(of) });
function recursive(build2) {
  const placeholder = Object.freeze({ kind: "self", depth: -1 });
  const body = asNode(build2(placeholder));
  const fix = (n, depth) => {
    if (n === placeholder) return node({ kind: "self", depth });
    return mapChildren(n, (c) => fix(c, depth + (n.kind === "rec" ? 1 : 0)));
  };
  return node({ kind: "rec", of: fix(body, 0) });
}
function mapChildren(n, f) {
  const fl = (fs) => {
    let changed = false;
    const out = fs.map((x) => {
      const t = f(x.type);
      if (t !== x.type) changed = true;
      return t === x.type ? x : Object.freeze({ name: x.name, type: t });
    });
    return changed ? Object.freeze(out) : fs;
  };
  switch (n.kind) {
    case "array":
    case "optional":
    case "nullable":
    case "default":
    case "delta":
    case "runs":
    case "named":
    case "rec":
    case "lz": {
      const of = f(n.of);
      return of === n.of ? n : node({ ...n, of });
    }
    case "struct": {
      const fields = fl(n.fields);
      const ext = n.ext.map(fl);
      return fields === n.fields && ext.every((g, i) => g === n.ext[i]) ? n : node({ ...n, fields, ext: Object.freeze(ext) });
    }
    case "union": {
      const variants = fl(n.variants);
      return variants === n.variants ? n : node({ ...n, variants });
    }
    case "tuple": {
      const items = n.items.map(f);
      return items.every((x, i) => x === n.items[i]) ? n : node({ ...n, items: Object.freeze(items) });
    }
    case "alt": {
      const of = n.of.map(f);
      return of.every((x, i) => x === n.of[i]) ? n : node({ ...n, of: Object.freeze(of) });
    }
    case "map": {
      const key = f(n.key);
      const value = f(n.value);
      return key === n.key && value === n.value ? n : node({ ...n, key, value });
    }
    case "grow": {
      const base = f(n.base);
      const of = f(n.of);
      return base === n.base && of === n.of ? n : node({ ...n, base, of });
    }
    default:
      return n;
  }
}
function categoryOf(n) {
  switch (n.kind) {
    case "uint":
    case "int":
    case "fixed":
    case "float":
    case "varuint":
    case "varint":
    case "num":
      return "number";
    case "bool":
      return "boolean";
    case "string":
    case "ref":
    case "hex":
      return "string";
    case "biguint":
      return "bigint";
    case "bytes":
      return "bytes";
    case "array":
    case "delta":
    case "runs":
    case "planes":
    case "tuple":
    case "lz":
    case "grow":
      return "array";
    case "struct":
    case "union":
    case "map":
      return "object";
    case "nullable":
      return "any";
    case "enum": {
      const c = /* @__PURE__ */ new Set([...n.values.map((v) => typeof v), ...n.other ? ["string"] : []]);
      return c.size === 1 ? [...c][0] : "any";
    }
    case "const":
      return n.value === null ? "null" : Array.isArray(n.value) ? "array" : typeof n.value;
    case "named":
    case "default":
      return categoryOf(n.of);
    default:
      return "any";
  }
}

// ../../../../../../keel-engine/packages/codec/src/schemas/common.ts
var coord = fixed(-8192, 8192, 1e-3);
var local = fixed(-8192, 8192, 1e-3, { k: 10 });
var localDelta = fixed(-8192, 8192, 1e-3, { k: 9, delta: true });
var size = fixed(0, 1024, 1e-3, { k: 9 });
var sizeDelta = fixed(0, 1024, 1e-3, { k: 9, delta: true });
var yaw = fixed(-Math.PI, Math.PI, Math.PI / 32768);
var unit = fixed(0, 1, 1 / 1024);
var signed = fixed(-1, 1, 1e-3);
var vec3 = tuple([coord, coord, coord]);
var lvec3 = tuple([local, local, local]);
var dvec3 = tuple([localDelta, localDelta, localDelta]);
var dhalf3 = tuple([sizeDelta, sizeDelta, sizeDelta]);
var half3 = tuple([size, size, size]);
var dir3 = tuple([signed, signed, signed]);
var seedText = ref("str", { packHex: true });
var seedAny = alt([num(), seedText]);
var oklch2 = tuple([fixed(0, 1, 1e-3, { off: "exact" }), fixed(0, 0.5, 1e-3, { off: "exact" }), fixed(0, 360, 0.01, { off: "exact" })]);
var id = ref("ids");
var count8 = uint(8);

// ../../../../../../keel-engine/packages/codec/src/codec-primitives.ts
var CodecError = class _CodecError extends Error {
  /** Field names and indices from the root ("parts", 3, "shape(box)", "h", 1). */
  path;
  /** The reason, without the path. */
  why;
  /** Decoding: the bit it happened at. */
  bit;
  constructor(why, path = [], bit = null) {
    super(why);
    this.name = "CodecError";
    this.why = why;
    this.path = path;
    this.bit = bit;
    this.message = _CodecError.format(why, path, bit);
  }
  static format(why, path, bit) {
    const p = pathText(path);
    return `${p ? `${p}: ` : ""}${why}${bit !== null ? ` (at bit ${bit})` : ""}`;
  }
};
function pathText(path) {
  let out = "";
  for (const k of path) out += typeof k === "number" ? `[${k}]` : out ? `.${k}` : k;
  return out;
}
var fail = (why) => {
  throw new CodecError(why);
};
function under(e, label, bit = null) {
  if (e instanceof CodecError) {
    e.path.unshift(label);
    if (e.bit === null && bit !== null) e.bit = bit;
    e.message = CodecError.format(e.why, e.path, e.bit);
    return e;
  }
  if (e instanceof BitError) return new CodecError(e.message.replace(/ at bit \d+/, ""), [label], e.bit);
  if (e instanceof Error) return new CodecError(e.message, [label]);
  return new CodecError(String(e), [label]);
}
var Tables = class {
  m = /* @__PURE__ */ new Map();
  constructor(init = {}) {
    for (const [name, list] of Object.entries(init)) for (const s of list) this.add(name, s);
  }
  table(name) {
    let t = this.m.get(name);
    if (!t) {
      t = { list: [], index: /* @__PURE__ */ new Map() };
      this.m.set(name, t);
    }
    return t;
  }
  add(name, s) {
    const t = this.table(name);
    const have = t.index.get(s);
    if (have !== void 0) return have;
    t.list.push(s);
    t.index.set(s, t.list.length - 1);
    return t.list.length - 1;
  }
  n = /* @__PURE__ */ new Map();
  /** A table of numbers (dyn()'s fractional numbers: a repeated one is its index). */
  numbers(name) {
    let t = this.n.get(name);
    if (!t) {
      t = { list: [], index: /* @__PURE__ */ new Map() };
      this.n.set(name, t);
    }
    return t;
  }
  sh = /* @__PURE__ */ new Map();
  /** A table of object shapes (dyn()'s key lists: an object shaped like one before is its index, then its values). */
  shapes(name) {
    let t = this.sh.get(name);
    if (!t) {
      t = { list: [], index: /* @__PURE__ */ new Map() };
      this.sh.set(name, t);
    }
    return t;
  }
  /** Every table's strings, by name (what a pack stores once when its documents share tables). */
  toJSON() {
    return Object.fromEntries([...this.m.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, [...v.list]]));
  }
};
var fresh = () => ({ tables: new Tables(), trace: null, strict: true, text: new BitWriter(64), tr: null, last: null });
var lastOf = (x) => x.last ??= /* @__PURE__ */ new Map();
function wr(c, o, v, x, label) {
  try {
    c.w(o, v, x);
  } catch (e) {
    throw under(e, label, null);
  }
}
function rd(c, i, x, label) {
  const start = i.at;
  try {
    if (x.trace === null) return c.r(i, x);
    x.trace.open(label, c.node, start);
    const v = c.r(i, x);
    x.trace.close(v, i.at);
    return v;
  } catch (e) {
    throw under(e, label, start);
  }
}
var meta = (x, label, start, i, value, note = "") => {
  x.trace?.meta(label, start, i.at - start, value, note);
};
function same(a, b) {
  if (typeof a === "number" || typeof b === "number") return Object.is(a, b);
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (a instanceof Uint8Array || b instanceof Uint8Array) {
    if (!(a instanceof Uint8Array && b instanceof Uint8Array) || a.length !== b.length) return false;
    for (let k = 0; k < a.length; k += 1) if (a[k] !== b[k]) return false;
    return true;
  }
  const aa = Array.isArray(a) || ArrayBuffer.isView(a);
  if (aa !== (Array.isArray(b) || ArrayBuffer.isView(b))) return false;
  if (aa) {
    const x = a, y = b;
    if (x.length !== y.length) return false;
    for (let k = 0; k < x.length; k += 1) if (!same(x[k], y[k])) return false;
    return true;
  }
  const ka = Object.keys(a).filter((k) => a[k] !== void 0);
  const kb = Object.keys(b).filter((k) => b[k] !== void 0);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!same(a[k], b[k])) return false;
  return true;
}
function put(o, k, v) {
  if (k === "__proto__") Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
  else o[k] = v;
}
var zig = (v) => v >= 0 ? v * 2 : -v * 2 - 1;
var unzig = (u2) => u2 % 2 ? -(u2 + 1) / 2 : u2 / 2;
var describe = (v) => typeof v === "string" ? JSON.stringify(v.length > 40 ? `${v.slice(0, 40)}...` : v) : typeof v === "bigint" ? `${v}n` : Array.isArray(v) ? `an array of ${v.length}` : v instanceof Uint8Array ? `${v.length} bytes` : v === null ? "null" : typeof v === "object" ? "an object" : String(v);
var GRIDS = /* @__PURE__ */ new WeakMap();
function gridOf(n) {
  const have = GRIDS.get(n);
  if (have) return have;
  const inv = 1 / n.step;
  const den = Math.abs(inv - Math.round(inv)) < 1e-9 * Math.max(1, inv) ? Math.round(inv) : 0;
  const value = den ? (k) => k / den : (k) => k * n.step;
  const units = den ? (v) => Math.round(v * den) : (v) => Math.round(v / n.step);
  const near = (x) => Math.abs(x - Math.round(x)) <= 1e-9 * Math.max(1, Math.abs(x)) ? Math.round(x) : null;
  const lo = near(n.min / n.step) ?? Math.ceil(n.min / n.step);
  const hi = near(n.max / n.step) ?? Math.floor(n.max / n.step);
  let places = -1;
  if (den) {
    for (let p = 0, ten = 1; p <= 15; p += 1, ten *= 10) if (ten % den === 0) {
      places = p;
      break;
    }
  }
  const g = { lo, hi, bits: bitsFor(hi - lo + 1), den, step: n.step, places, value, units };
  GRIDS.set(n, g);
  return g;
}
function intCheck(v, what) {
  if (typeof v !== "number" || !Number.isInteger(v)) fail(`${describe(v)} is not a whole number (${what}).`);
  return v;
}
var NUM_KINDS = ["int", "decimal", "float32", "float64"];
var TEN = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8];
function placesOf(v) {
  if (!Number.isFinite(v) || Object.is(v, -0) || Math.abs(v) > 2 ** 40) return 0;
  for (let p = 1; p <= 8; p += 1) {
    const m = Math.round(v * TEN[p]);
    if (Math.abs(m) <= 2 ** 51 && m / TEN[p] === v) return p;
  }
  return 0;
}
function writeNum(o, v, tagBits) {
  if (Number.isSafeInteger(v) && !Object.is(v, -0) && Math.abs(v) <= 2 ** 51) {
    o.bits(0, tagBits);
    o.golomb(zig(v), 0);
    return;
  }
  const p = placesOf(v);
  if (p) {
    o.bits(1, tagBits);
    o.bits(p - 1, 3);
    o.golomb(zig(Math.round(v * TEN[p])), 0);
    return;
  }
  if (Number.isNaN(v) || Object.is(Math.fround(v), v)) {
    o.bits(2, tagBits);
    o.f32(v);
    return;
  }
  o.bits(3, tagBits);
  o.f64(v);
}
function readNum(i, tag) {
  if (tag === 0) return unzig(i.golomb(0));
  if (tag === 1) {
    const p = i.bits(3) + 1;
    const m = unzig(i.golomb(0));
    const v = m / TEN[p];
    if (Number.isInteger(v) || placesOf(v) !== p) throw new CodecError(`A decimal with ${p} places that isn't its shortest spelling (not canonical).`);
    return v;
  }
  if (tag === 2) return i.f32();
  return i.f64();
}
var COMPILED = /* @__PURE__ */ new WeakMap();
function compiled(root, compile2) {
  const have = COMPILED.get(root);
  if (have) return have;
  const c = compile2(root, []);
  COMPILED.set(root, c);
  return c;
}
var enc = new TextEncoder();
function utf8(s) {
  const n = s.length;
  if (n < 64) {
    let ascii = true;
    for (let k = 0; k < n; k += 1) if (s.charCodeAt(k) > 127) {
      ascii = false;
      break;
    }
    if (ascii) {
      const b = new Uint8Array(n);
      for (let k = 0; k < n; k += 1) b[k] = s.charCodeAt(k);
      return b;
    }
  }
  return enc.encode(s);
}
function fromUtf8(tr, len2) {
  const b = tr.bytes(len2);
  if (len2 < 64) {
    let ascii = true;
    for (let k = 0; k < len2; k += 1) if (b[k] > 127) {
      ascii = false;
      break;
    }
    if (ascii) return String.fromCharCode.apply(null, b);
  }
  return dec.decode(b);
}
var LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
var wellFormed = (s) => !LONE.test(s);
var SCRATCH = new BitWriter(64);
var dec = new TextDecoder("utf-8", { fatal: true });

// ../../../../../../keel-engine/packages/codec/src/codec.ts
function compiled2(root) {
  return compiled(root, compile);
}
function compile(n, recs) {
  switch (n.kind) {
    case "uint": {
      const max = 2 ** n.bits;
      const what = `uint(${n.bits})`;
      return {
        node: n,
        w(o, v) {
          const k = intCheck(v, what);
          if (k < 0 || k >= max) fail(`${k} is outside ${what}'s 0..${max - 1}.`);
          o.wide(k, n.bits);
        },
        r: (i) => i.bits(n.bits)
      };
    }
    case "int": {
      const half = 2 ** (n.bits - 1);
      const what = `int(${n.bits})`;
      return {
        node: n,
        w(o, v) {
          const k = intCheck(v, what);
          if (k < -half || k >= half) fail(`${k} is outside ${what}'s ${-half}..${half - 1}.`);
          o.wide(zig(k), n.bits);
        },
        r: (i) => unzig(i.bits(n.bits))
      };
    }
    case "bool":
      return {
        node: n,
        w(o, v) {
          if (typeof v !== "boolean") fail(`${describe(v)} is not a boolean.`);
          o.bool(v);
        },
        r: (i) => i.bool()
      };
    case "fixed": {
      const g = gridOf(n);
      const what = `fixed(${n.min}, ${n.max}, ${n.step})`;
      const exact = n.off === "exact";
      const signed2 = g.lo < 0;
      const self = {};
      const put2 = n.delta ? (o, k, x) => {
        const m = lastOf(x);
        const d = k - (m.get(self) ?? 0);
        if (d === 0) o.bool(false);
        else {
          o.bool(true);
          o.golomb(zig(d) - 1, n.k);
        }
        m.set(self, k);
      } : n.k >= 0 ? (o, k) => o.golomb(signed2 ? zig(k) : k, n.k) : (o, k) => o.wide(k - g.lo, g.bits);
      const get = n.delta ? (i, x) => {
        const m = lastOf(x);
        const k = (m.get(self) ?? 0) + (i.bool() ? unzig(i.golomb(n.k) + 1) : 0);
        if (k < g.lo || k > g.hi) fail(`${g.value(k)} is outside ${what} (corrupt data).`);
        m.set(self, k);
        return k;
      } : n.k >= 0 ? (i) => {
        const u2 = i.golomb(n.k);
        const k = signed2 ? unzig(u2) : u2;
        if (k < g.lo || k > g.hi) fail(`${g.value(k)} is outside ${what} (corrupt data).`);
        return k;
      } : (i) => i.wide(g.bits) + g.lo;
      return {
        node: n,
        w(o, v, ctx) {
          if (typeof v !== "number") fail(`${describe(v)} is not a number (${what}).`);
          const x = v;
          if (exact) {
            const k2 = Number.isFinite(x) ? g.units(x) : NaN;
            if (k2 >= g.lo && k2 <= g.hi && Object.is(g.value(k2) === 0 ? 0 : g.value(k2), x)) {
              o.bool(false);
              put2(o, k2, ctx);
              return;
            }
            o.bool(true);
            o.f64(x);
            return;
          }
          if (!Number.isFinite(x)) fail(`${x} is not a finite number (${what}).`);
          const k = g.units(x);
          if (k < g.lo) fail(`${x} is below ${what}'s min ${n.min}.`);
          if (k > g.hi) fail(`${x} is above ${what}'s max ${n.max}.`);
          if (n.off === "strict" && g.value(k) !== x) fail(`${x} is not on ${what}'s grid (nearest ${g.value(k)}).`);
          put2(o, k, ctx);
        },
        r(i, x) {
          if (exact) {
            const s = i.at;
            const whole2 = i.bool();
            if (x.trace) meta(x, "exact", s, i, whole2, whole2 ? "off the grid: a float64" : "on the grid");
            if (whole2) return i.f64();
          }
          const v = g.value(get(i, x));
          return v === 0 ? 0 : v;
        }
      };
    }
    case "float": {
      const bits = n.bits;
      return {
        node: n,
        w(o, v) {
          if (typeof v !== "number") fail(`${describe(v)} is not a number.`);
          const x = v;
          if (bits === 32) {
            if (!Number.isNaN(x) && !Object.is(Math.fround(x), x)) fail(`${x} is not exactly a float32 (use float64 or fixed()).`);
            o.f32(x);
          } else if (bits === 16) {
            if (!Number.isNaN(x) && !Object.is(fromHalf(toHalf(x)), x)) fail(`${x} is not exactly a float16 (use float32, float64 or fixed()).`);
            o.f16(x);
          } else o.f64(x);
        },
        r: (i) => bits === 32 ? i.f32() : bits === 16 ? i.f16() : i.f64()
      };
    }
    case "varuint":
    case "varint": {
      const signed2 = n.kind === "varint";
      const put2 = n.group ? (o, u2) => o.groups(u2, n.group) : (o, u2) => o.golomb(u2, n.k);
      const get = n.group ? (i) => i.groups(n.group) : (i) => i.golomb(n.k);
      return {
        node: n,
        w(o, v) {
          const k = intCheck(v, n.kind);
          if (!Number.isSafeInteger(k)) fail(`${k} is beyond a safe integer.`);
          if (!signed2 && k < 0) fail(`${k} is negative (a varuint).`);
          if (signed2 && Math.abs(k) > 2 ** 51) fail(`${k} is beyond a varint's \xB12^51.`);
          put2(o, signed2 ? zig(k) : k);
        },
        r: (i) => signed2 ? unzig(get(i)) : get(i)
      };
    }
    case "num":
      return {
        node: n,
        w(o, v) {
          if (typeof v !== "number") fail(`${describe(v)} is not a number.`);
          writeNum(o, v, 2);
        },
        r(i, x) {
          const s = i.at;
          const tag = i.bits(2);
          if (x.trace) meta(x, "kind", s, i, NUM_KINDS[tag], "");
          return readNum(i, tag);
        }
      };
    case "biguint": {
      const lim = 1n << BigInt(n.bits);
      return {
        node: n,
        w(o, v) {
          if (typeof v !== "bigint") fail(`${describe(v)} is not a bigint (biguint(${n.bits})).`);
          if (v < 0n || v >= lim) fail(`${v}n is outside biguint(${n.bits}).`);
          o.big(v, n.bits);
        },
        r: (i) => i.big(n.bits)
      };
    }
    case "enum": {
      const index = new Map(n.values.map((v, k) => [v, k]));
      const limit = n.capacity || n.values.length;
      const width = bitsFor(limit + (n.other ? 1 : 0));
      const str = n.other ? compile({ kind: "string", max: 0 }, []) : null;
      return {
        node: n,
        w(o, v, x) {
          const k = index.get(v);
          if (k === void 0) {
            if (str && typeof v === "string") {
              if (n.open) o.golomb(limit, 0);
              else o.bits(limit, width);
              str.w(o, v, x);
              return;
            }
            fail(`${describe(v)} is not one of ${JSON.stringify(n.values.length > 12 ? [...n.values.slice(0, 12), "..."] : n.values)}.`);
          }
          if (n.open) o.golomb(k, 0);
          else o.bits(k, width);
        },
        r(i, x) {
          const s = i.at;
          const k = n.open ? i.golomb(0) : i.bits(width);
          if (str && k === limit) {
            if (x.trace) meta(x, "other", s, i, k, "not in the list: written out");
            return str.r(i, x);
          }
          if (k >= n.values.length) fail(`Enum index ${k} is not a value this reader knows (it knows ${n.values.length}: data from a newer schema?).`);
          return n.values[k];
        }
      };
    }
    case "string": {
      const lw = n.max ? bitsFor(n.max + 1) : -1;
      const HEX = /^0x(?:[0-9a-f]{2})+$/;
      return {
        node: n,
        w(o, v, x) {
          if (typeof v !== "string") fail(`${describe(v)} is not a string.`);
          const s = v;
          const text = x.text;
          if (n.packHex) {
            const packed = HEX.test(s);
            o.bool(packed);
            if (packed) {
              const len2 = (s.length - 2) / 2;
              o.golomb(len2 - 1, 0);
              for (let k = 0; k < len2; k += 1) text.bits(parseInt(s.slice(2 + k * 2, 4 + k * 2), 16), 8);
              return;
            }
          }
          if (!wellFormed(s)) fail("The string has a lone surrogate (not UTF-8 encodable).");
          const b = utf8(s);
          if (n.max && b.length > n.max) fail(`The string is ${b.length} bytes; the max is ${n.max}.`);
          if (lw >= 0) o.bits(b.length, lw);
          else o.golomb(b.length, 0);
          text.bytes(b);
        },
        r(i, x) {
          const tr = x.tr;
          if (n.packHex) {
            const s0 = i.at;
            const packed = i.bool();
            if (x.trace) meta(x, "hex", s0, i, packed, packed ? "0x hex, packed as bytes" : "text");
            if (packed) {
              const s1 = i.at;
              const len3 = i.golomb(0) + 1;
              if (x.trace) meta(x, "length", s1, i, len3, `${len3} bytes`);
              const t02 = tr.at;
              let out2 = "0x";
              for (let k = 0; k < len3; k += 1) out2 += tr.bits(8).toString(16).padStart(2, "0");
              if (x.trace) x.trace.meta("text", t02, len3 * 8, out2, `${len3} bytes in the text section`);
              return out2;
            }
          }
          const s = i.at;
          const len2 = lw >= 0 ? i.bits(lw) : i.golomb(0);
          if (x.trace) meta(x, "length", s, i, len2, `${len2} bytes`);
          if (n.max && len2 > n.max) fail(`The string is ${len2} bytes; the max is ${n.max}.`);
          const t0 = tr.at;
          const out = fromUtf8(tr, len2);
          if (x.trace) x.trace.meta("text", t0, len2 * 8, out, `${len2} bytes in the text section`);
          return out;
        }
      };
    }
    case "ref": {
      const text = compile({ kind: "string", max: 0, packHex: n.packHex }, []);
      return {
        node: n,
        w(o, v, x) {
          if (typeof v !== "string") fail(`${describe(v)} is not a string (ref "${n.table}").`);
          const s = v;
          const t = x.tables.table(n.table);
          const k = t.index.get(s);
          const size3 = t.list.length;
          if (k !== void 0) {
            o.bits(k, bitsFor(size3 + 1));
            return;
          }
          o.bits(size3, bitsFor(size3 + 1));
          text.w(o, s, x);
          t.list.push(s);
          t.index.set(s, size3);
        },
        r(i, x) {
          const t = x.tables.table(n.table);
          const size3 = t.list.length;
          const s0 = i.at;
          const k = i.bits(bitsFor(size3 + 1));
          if (k < size3) {
            if (x.trace) meta(x, "index", s0, i, k, `table ${n.table} #${k} of ${size3}`);
            return t.list[k];
          }
          if (k > size3) fail(`Table ${n.table} has ${size3} strings; the data names #${k}.`);
          if (x.trace) meta(x, "index", s0, i, k, `new: table ${n.table} #${k}`);
          const s = text.r(i, x);
          if (t.index.has(s)) fail(`${JSON.stringify(s)} written again in full (not canonical: it's table ${n.table} #${t.index.get(s)}).`);
          t.list.push(s);
          t.index.set(s, size3);
          return s;
        }
      };
    }
    case "bytes":
      return {
        node: n,
        w(o, v) {
          if (!(v instanceof Uint8Array)) fail(`${describe(v)} is not a Uint8Array.`);
          const b = v;
          if (n.length) {
            if (b.length !== n.length) fail(`${b.length} bytes; this is exactly ${n.length}.`);
          } else o.golomb(b.length, 0);
          o.bytes(b);
        },
        r(i, x) {
          const s = i.at;
          const len2 = n.length || i.golomb(0);
          if (!n.length) {
            if (x.trace) meta(x, "length", s, i, len2, `${len2} bytes`);
          }
          return i.bytes(len2);
        }
      };
    case "hex": {
      const re = /^0x(?:[0-9a-f]{2})*$/;
      return {
        node: n,
        w(o, v) {
          if (typeof v !== "string" || !re.test(v)) fail(`${describe(v)} is not "0x" + lower-case hex byte pairs.`);
          const s = v;
          const len2 = (s.length - 2) / 2;
          if (n.bytes) {
            if (len2 !== n.bytes) fail(`${len2} bytes of hex; this is exactly ${n.bytes}.`);
          } else o.golomb(len2, 0);
          for (let k = 0; k < len2; k += 1) o.bits(parseInt(s.slice(2 + k * 2, 4 + k * 2), 16), 8);
        },
        r(i, x) {
          const s = i.at;
          const len2 = n.bytes || i.golomb(0);
          if (!n.bytes) {
            if (x.trace) meta(x, "length", s, i, len2, `${len2} bytes`);
          }
          let out = "0x";
          for (let k = 0; k < len2; k += 1) out += i.bits(8).toString(16).padStart(2, "0");
          return out;
        }
      };
    }
    case "const":
      return {
        node: n,
        w(_o, v) {
          if (!same(v, n.value)) fail(`${describe(v)} is not the constant ${JSON.stringify(n.value)}.`);
        },
        r: () => structuredClone(n.value)
      };
    case "dyn":
      return dynCodec(n);
    case "array": {
      const of = compile(n.of, recs);
      const lw = n.max ? bitsFor(n.max + 1) : -1;
      return {
        node: n,
        w(o, v, x) {
          if (!Array.isArray(v) && !(ArrayBuffer.isView(v) && !(v instanceof DataView))) fail(`${describe(v)} is not an array.`);
          const a = v;
          if (n.length) {
            if (a.length !== n.length) fail(`${a.length} items; this is exactly ${n.length}.`);
          } else if (lw >= 0) {
            if (a.length > n.max) fail(`${a.length} items; the max is ${n.max}.`);
            o.bits(a.length, lw);
          } else o.golomb(a.length, 0);
          let k = 0;
          try {
            for (; k < a.length; k += 1) of.w(o, a[k], x);
          } catch (e) {
            throw under(e, k, null);
          }
        },
        r(i, x) {
          const s = i.at;
          const len2 = n.length || (lw >= 0 ? i.bits(lw) : i.golomb(0));
          if (!n.length) {
            if (x.trace) meta(x, "length", s, i, len2, `${len2} items`);
          }
          if (n.max && len2 > n.max) fail(`${len2} items; the max is ${n.max}.`);
          if (len2 > 2 ** 28) fail(`${len2} items: corrupt data.`);
          const out = new Array(len2);
          if (x.trace !== null) {
            for (let k2 = 0; k2 < len2; k2 += 1) out[k2] = rd(of, i, x, k2);
            return out;
          }
          let k = 0;
          try {
            for (; k < len2; k += 1) out[k] = of.r(i, x);
          } catch (e) {
            throw under(e, k, null);
          }
          return out;
        }
      };
    }
    case "grow": {
      const b = n.base;
      const item = compile(b.of, recs);
      const next = compile(n.of, recs);
      const lw = bitsFor(b.max + 1);
      const spare = 2 ** lw - 1;
      const above = recs.map((c) => c.node);
      return {
        node: n,
        w(o, v, x) {
          if (!holds(b, v, above)) {
            o.bits(spare, lw);
            next.w(o, v, x);
            return;
          }
          if (!Array.isArray(v) && !(ArrayBuffer.isView(v) && !(v instanceof DataView))) fail(`${describe(v)} is not an array.`);
          const a = v;
          o.bits(a.length, lw);
          let k = 0;
          try {
            for (; k < a.length; k += 1) item.w(o, a[k], x);
          } catch (e) {
            throw under(e, k, null);
          }
        },
        r(i, x) {
          const s = i.at;
          const len2 = i.bits(lw);
          if (len2 === spare) {
            if (x.trace) meta(x, "grown", s, i, len2, "the spare length code: the grown layout follows");
            const v = next.r(i, x);
            if (holds(b, v, above)) fail("Written in the grown layout, but the original layout holds it (not canonical).");
            return v;
          }
          if (x.trace) meta(x, "length", s, i, len2, `${len2} items`);
          if (len2 > b.max) fail(`${len2} items; the max is ${b.max}.`);
          const out = new Array(len2);
          if (x.trace !== null) {
            for (let k2 = 0; k2 < len2; k2 += 1) out[k2] = rd(item, i, x, k2);
            return out;
          }
          let k = 0;
          try {
            for (; k < len2; k += 1) out[k] = item.r(i, x);
          } catch (e) {
            throw under(e, k, null);
          }
          return out;
        }
      };
    }
    case "optional":
    case "nullable": {
      const of = compile(n.of, recs);
      const none = n.kind === "optional" ? void 0 : null;
      return {
        node: n,
        w(o, v, x) {
          const has = n.kind === "optional" ? v !== void 0 : v !== null;
          if (n.kind === "nullable" && v === void 0 && n.of.kind !== "optional" && n.of.kind !== "default") fail("undefined is not a value here (nullable: give null).");
          o.bool(has);
          if (has) of.w(o, v, x);
        },
        r(i, x) {
          const s = i.at;
          const has = i.bool();
          if (x.trace) meta(x, "present", s, i, has, has ? "present" : n.kind === "optional" ? "absent" : "null");
          return has ? of.r(i, x) : none;
        }
      };
    }
    case "default": {
      const of = compile(n.of, recs);
      try {
        of.w(new BitWriter(16), n.value, fresh());
      } catch (e) {
        throw new SchemaError(`withDefault(): the default isn't a value of its type: ${e.message}`);
      }
      return {
        node: n,
        w(o, v, x) {
          if (v === void 0 || same(v, n.value)) {
            o.bool(false);
            return;
          }
          o.bool(true);
          of.w(o, v, x);
        },
        r(i, x) {
          const s = i.at;
          const given = i.bool();
          if (x.trace) meta(x, "given", s, i, given, given ? "not the default" : "the default");
          return given ? of.r(i, x) : structuredClone(n.value);
        }
      };
    }
    case "struct":
      return structCodec(n.fields, n.open, n.ext, recs, n, null);
    case "tuple": {
      const items = n.items.map((it) => compile(it, recs));
      return {
        node: n,
        w(o, v, x) {
          if (!Array.isArray(v)) fail(`${describe(v)} is not a tuple (an array of ${items.length}).`);
          const a = v;
          if (a.length !== items.length) fail(`A tuple of ${items.length}; got ${a.length} items.`);
          for (let k = 0; k < items.length; k += 1) wr(items[k], o, a[k], x, k);
        },
        r(i, x) {
          const out = new Array(items.length);
          for (let k = 0; k < items.length; k += 1) out[k] = rd(items[k], i, x, k);
          return out;
        }
      };
    }
    case "union": {
      const variants = n.variants.map((f) => {
        const s = f.type;
        return { name: f.name, c: structCodec(s.fields, s.open, s.ext, recs, s, n.tag) };
      });
      const index = new Map(variants.map((v, k) => [v.name, k]));
      const width = bitsFor(n.capacity || variants.length);
      return {
        node: n,
        w(o, v, x) {
          if (typeof v !== "object" || v === null) fail(`${describe(v)} is not an object (a union by "${n.tag}").`);
          const tag = v[n.tag];
          const k = typeof tag === "string" ? index.get(tag) : void 0;
          if (k === void 0) fail(`${n.tag} ${describe(tag)} is not one of ${variants.map((x2) => x2.name).join(", ")}.`);
          o.bits(k, width);
          wr(variants[k].c, o, v, x, `${n.tag}(${String(tag)})`);
        },
        r(i, x) {
          const s = i.at;
          const k = i.bits(width);
          const vt = variants[k];
          if (!vt) fail(`Union tag ${k} is not a variant this reader knows (it knows ${variants.length}: data from a newer schema?).`);
          if (x.trace) meta(x, n.tag, s, i, vt.name, `variant ${k}: ${vt.name}`);
          const body = rd(vt.c, i, x, `${n.tag}(${vt.name})`);
          const out = { [n.tag]: vt.name };
          for (const key in body) put(out, key, body[key]);
          return out;
        }
      };
    }
    case "alt": {
      const branches = n.of.map((b) => ({ cat: categoryOf(b), c: compile(b, recs) }));
      const width = bitsFor(branches.length);
      return {
        node: n,
        w(o, v, x) {
          const cat = valueCategory(v);
          const k = branches.findIndex((b) => b.cat === cat);
          if (k < 0) fail(`${describe(v)} (${cat}) matches none of ${branches.map((b) => b.cat).join(", ")}.`);
          o.bits(k, width);
          wr(branches[k].c, o, v, x, `(${cat})`);
        },
        r(i, x) {
          const s = i.at;
          const k = i.bits(width);
          const b = branches[k];
          if (!b) fail(`Alt branch ${k} doesn't exist.`);
          if (x.trace) meta(x, "branch", s, i, b.cat, `branch ${k}: ${b.cat}`);
          return rd(b.c, i, x, `(${b.cat})`);
        }
      };
    }
    case "map": {
      const kc = compile(n.key, recs);
      const vc = compile(n.value, recs);
      return {
        node: n,
        w(o, v, x) {
          if (typeof v !== "object" || v === null || Array.isArray(v)) fail(`${describe(v)} is not a record.`);
          const rec = v;
          const keys = Object.keys(rec).filter((k) => rec[k] !== void 0);
          if (n.order === "sorted") keys.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
          o.golomb(keys.length, 0);
          for (const k of keys) {
            wr(kc, o, k, x, `${k}(key)`);
            wr(vc, o, rec[k], x, k);
          }
        },
        r(i, x) {
          const s = i.at;
          const count = i.golomb(0);
          if (x.trace) meta(x, "count", s, i, count, `${count} entries`);
          const out = {};
          let last = null;
          for (let k = 0; k < count; k += 1) {
            const key = rd(kc, i, x, `#${k}(key)`);
            if (Object.hasOwn(out, key)) fail(`The key ${JSON.stringify(key)} is in the map twice.`);
            if (n.order === "sorted" && last !== null && !(last < key)) fail(`Map keys out of order (${JSON.stringify(last)} before ${JSON.stringify(key)}): not canonical.`);
            last = key;
            put(out, key, rd(vc, i, x, key));
          }
          return out;
        }
      };
    }
    case "delta": {
      const first = compile(n.of, recs);
      const of = n.of;
      const g = of.kind === "fixed" ? gridOf(of) : null;
      const toUnits = g ? (v) => g.units(v) : (v) => v;
      const fromUnits = g ? (k) => {
        const v = g.value(k);
        return v === 0 ? 0 : v;
      } : (k) => k;
      const lo = g ? g.lo : of.kind === "uint" || of.kind === "varuint" ? 0 : -Infinity;
      const hi = g ? g.hi : of.kind === "uint" ? 2 ** of.bits - 1 : of.kind === "int" ? 2 ** (of.bits - 1) - 1 : Infinity;
      const lo2 = of.kind === "int" ? -(2 ** (of.bits - 1)) : lo;
      return {
        node: n,
        w(o, v, x) {
          if (!Array.isArray(v) && !ArrayBuffer.isView(v)) fail(`${describe(v)} is not an array.`);
          const a = v;
          o.golomb(a.length, 0);
          if (!a.length) return;
          wr(first, o, a[0], x, 0);
          let prev = toUnits(a[0]);
          for (let k = 1; k < a.length; k += 1) {
            const e = a[k];
            SCRATCH.reset();
            try {
              first.w(SCRATCH, e, x);
            } catch (err) {
              throw under(err, k, null);
            }
            const u2 = toUnits(e);
            o.golomb(zig(u2 - prev), n.k);
            prev = u2;
          }
        },
        r(i, x) {
          const s = i.at;
          const len2 = i.golomb(0);
          if (x.trace) meta(x, "length", s, i, len2, `${len2} items`);
          const out = new Array(len2);
          if (!len2) return out;
          out[0] = rd(first, i, x, 0);
          let prev = toUnits(out[0]);
          for (let k = 1; k < len2; k += 1) {
            const s1 = i.at;
            const d = unzig(i.golomb(n.k));
            prev += d;
            if (prev < lo2 || prev > hi) throw under(new CodecError(`A delta walks out of range (${prev}).`), k, s1);
            out[k] = fromUnits(prev);
            if (x.trace) meta(x, `[${k}]`, s1, i, out[k], `${d >= 0 ? "+" : ""}${d}`);
          }
          return out;
        }
      };
    }
    case "runs": {
      const of = compile(n.of, recs);
      return {
        node: n,
        w(o, v, x) {
          if (!Array.isArray(v) && !ArrayBuffer.isView(v)) fail(`${describe(v)} is not an array.`);
          const a = v;
          o.golomb(a.length, 0);
          let k = 0;
          while (k < a.length) {
            let j = k + 1;
            while (j < a.length && same(a[j], a[k])) j += 1;
            wr(of, o, a[k], x, k);
            o.golomb(j - k - 1, 0);
            k = j;
          }
        },
        r(i, x) {
          const s = i.at;
          const len2 = i.golomb(0);
          if (x.trace) meta(x, "length", s, i, len2, `${len2} items`);
          const out = new Array(len2);
          let k = 0;
          let prev = void 0;
          while (k < len2) {
            const v = rd(of, i, x, k);
            if (k > 0 && same(v, prev)) fail(`Two runs of the same value at ${k}: not canonical.`);
            const s1 = i.at;
            const run = i.golomb(0) + 1;
            if (x.trace) meta(x, "run", s1, i, run, `x${run}`);
            if (k + run > len2) fail(`A run of ${run} overruns the ${len2} items.`);
            for (let j = 0; j < run; j += 1) out[k + j] = j === 0 ? v : structuredClone(v);
            k += run;
            prev = v;
          }
          return out;
        }
      };
    }
    case "lz": {
      const of = compile(n.of, recs);
      const MIN = n.min;
      const WINDOW = 1 << 16;
      const CHAIN = 48;
      return {
        node: n,
        w(o, v, x) {
          if (!Array.isArray(v) && !ArrayBuffer.isView(v)) fail(`${describe(v)} is not an array.`);
          const a = v;
          const L = a.length;
          o.golomb(L, 0);
          const heads = /* @__PURE__ */ new Map();
          const keyAt = (p) => {
            let key = "";
            for (let q = 0; q < MIN; q += 1) key += `${typeof a[p + q] === "string" ? "s" : ""}${String(a[p + q])}\0`;
            return key;
          };
          const insert = (p) => {
            if (p + MIN > L) return;
            const key = keyAt(p);
            let c = heads.get(key);
            if (!c) {
              c = [];
              heads.set(key, c);
            }
            c.push(p);
            if (c.length > CHAIN * 2) c.splice(0, c.length - CHAIN);
          };
          let i = 0;
          while (i < L) {
            let bestLen = 0, bestDist = 0;
            if (i + MIN <= L) {
              const c = heads.get(keyAt(i));
              if (c) for (let q = c.length - 1, tries = 0; q >= 0 && tries < CHAIN; q -= 1, tries += 1) {
                const j = c[q];
                if (i - j > WINDOW) break;
                let len2 = 0;
                while (i + len2 < L && a[j + len2] === a[i + len2]) len2 += 1;
                if (len2 > bestLen) {
                  bestLen = len2;
                  bestDist = i - j;
                  if (i + len2 === L) break;
                }
              }
            }
            if (bestLen >= MIN) {
              o.bool(true);
              o.golomb(bestDist - 1, 0);
              o.golomb(bestLen - MIN, 0);
              for (let q = 0; q < bestLen; q += 1) insert(i + q);
              i += bestLen;
            } else {
              o.bool(false);
              wr(of, o, a[i], x, i);
              insert(i);
              i += 1;
            }
          }
        },
        r(i, x) {
          const s = i.at;
          const L = i.golomb(0);
          if (x.trace) meta(x, "length", s, i, L, `${L} items`);
          const out = new Array(L);
          let k = 0;
          while (k < L) {
            const s1 = i.at;
            if (i.bool()) {
              const dist = i.golomb(0) + 1;
              const len2 = i.golomb(0) + MIN;
              if (x.trace) meta(x, "copy", s1, i, len2, `${len2} items from ${dist} back`);
              if (dist > k) fail(`A copy from ${dist} back at item ${k} reaches before the start.`);
              if (k + len2 > L) fail(`A copy of ${len2} at item ${k} overruns the ${L} items.`);
              for (let q = 0; q < len2; q += 1) out[k + q] = out[k + q - dist];
              k += len2;
            } else {
              if (x.trace) meta(x, "literal", s1, i, null, "a literal item");
              out[k] = rd(of, i, x, k);
              k += 1;
            }
          }
          return out;
        }
      };
    }
    case "planes": {
      const lim = 2 ** n.bits;
      return {
        node: n,
        w(o, v) {
          if (!Array.isArray(v) && !ArrayBuffer.isView(v)) fail(`${describe(v)} is not an array.`);
          const a = v;
          for (let k = 0; k < a.length; k += 1) {
            const e = a[k];
            if (typeof e !== "number" || !Number.isInteger(e) || e < 0 || e >= lim) throw under(new CodecError(`${describe(e)} is outside planes(${n.bits})'s 0..${lim - 1}.`), k, null);
          }
          o.golomb(a.length, 0);
          for (let b = n.bits - 1; b >= 0; b -= 1) {
            const m = 2 ** b;
            for (let k = 0; k < a.length; k += 1) o.bits(Math.floor(a[k] / m) % 2, 1);
          }
        },
        r(i, x) {
          const s = i.at;
          const len2 = i.golomb(0);
          if (x.trace) meta(x, "length", s, i, len2, `${len2} items`);
          const out = new Array(len2).fill(0);
          for (let b = n.bits - 1; b >= 0; b -= 1) {
            const s1 = i.at;
            const m = 2 ** b;
            for (let k = 0; k < len2; k += 1) if (i.bool()) out[k] = out[k] + m;
            if (x.trace) meta(x, `plane ${b}`, s1, i, null, `bit ${b} of every value`);
          }
          return out;
        }
      };
    }
    case "named": {
      const of = compile(n.of, recs);
      return { node: n, w: (o, v, x) => of.w(o, v, x), r: (i, x) => of.r(i, x) };
    }
    case "rec": {
      const fwd = { c: null };
      const self = { node: n, w: (o, v, x) => fwd.c.w(o, v, x), r: (i, x) => fwd.c.r(i, x) };
      fwd.c = compile(n.of, [...recs, self]);
      return self;
    }
    case "self": {
      const target = recs[recs.length - 1 - n.depth];
      if (!target) throw new SchemaError(`A self node (depth ${n.depth}) outside its recursive().`);
      return { node: n, w: (o, v, x) => target.w(o, v, x), r: (i, x) => target.r(i, x) };
    }
  }
}
function holds(n, v, recs = []) {
  const fields = (fs, ext, tag) => {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return true;
    const rec = v;
    const all = [...fs, ...ext.flat()];
    for (const key in rec) if (rec[key] !== void 0 && key !== tag && !all.some((f) => f.name === key)) return false;
    return all.every((f) => rec[f.name] === void 0 || holds(f.type, rec[f.name], recs));
  };
  switch (n.kind) {
    case "named":
    case "default":
    case "optional":
      return v === void 0 || holds(n.of, v, recs);
    case "nullable":
      return v === void 0 || v === null || holds(n.of, v, recs);
    case "rec":
      return holds(n.of, v, [...recs, n]);
    case "self": {
      const at = recs.length - 1 - n.depth;
      return at < 0 || holds(recs[at], v, recs.slice(0, at));
    }
    case "array":
    case "runs":
    case "lz": {
      if (!Array.isArray(v) && !(ArrayBuffer.isView(v) && !(v instanceof DataView))) return true;
      const a = v;
      if (n.kind === "array" && n.max && a.length > n.max) return false;
      for (let k = 0; k < a.length; k += 1) if (!holds(n.of, a[k], recs)) return false;
      return true;
    }
    case "tuple":
      return !Array.isArray(v) || n.items.every((t, k) => holds(t, v[k], recs));
    case "struct":
      return fields(n.fields, n.ext, null);
    case "union": {
      const tag = typeof v === "object" && v !== null ? v[n.tag] : void 0;
      const variant = n.variants.find((x) => x.name === tag)?.type;
      return !variant || fields(variant.fields, variant.ext, n.tag);
    }
    case "alt": {
      const cat = valueCategory(v);
      const b = n.of.find((x) => categoryOf(x) === cat);
      return !b || holds(b, v, recs);
    }
    case "map":
      return typeof v !== "object" || v === null || Array.isArray(v) || Object.values(v).every((x) => x === void 0 || holds(n.value, x, recs));
    case "grow":
      return holds(n.of, v, recs);
    default:
      return true;
  }
}
function valueCategory(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (v instanceof Uint8Array) return "bytes";
  const t = typeof v;
  if (t === "number" || t === "string" || t === "boolean" || t === "bigint") return t;
  return "object";
}
function structCodec(fields, open, ext, recs, node2, tagKey) {
  const fs = fields.map((f) => ({ name: f.name, c: compile(f.type, recs), optional: f.type.kind === "optional" }));
  const groups = ext.map((g) => g.map((f) => ({ name: f.name, c: compile(f.type, recs), optional: f.type.kind === "optional", node: f.type })));
  const known = new Set([...fields, ...ext.flat()].map((f) => f.name));
  if (tagKey !== null) known.add(tagKey);
  const proto = known.has("__proto__");
  const scratch = [];
  const empty = (g, v) => g.every((f) => v[f.name] === void 0 || f.node.kind === "default" && same(v[f.name], f.node.value));
  return {
    node: node2,
    w(o, v, x) {
      if (typeof v !== "object" || v === null || Array.isArray(v)) fail(`${describe(v)} is not an object.`);
      const rec = v;
      let k = 0;
      let given = tagKey !== null && rec[tagKey] !== void 0 ? 1 : 0;
      try {
        for (; k < fs.length; k += 1) {
          const f = fs[k];
          const fv = rec[f.name];
          if (fv !== void 0) given += 1;
          f.c.w(o, fv, x);
        }
      } catch (e) {
        throw under(e, fs[k].name, null);
      }
      if (x.strict) {
        let all = 0;
        for (const key in rec) if (rec[key] !== void 0) all += 1;
        if (all > given) {
          for (const g of groups) for (const f of g) if (rec[f.name] !== void 0) given += 1;
          if (all > given) {
            for (const key in rec) if (!known.has(key) && rec[key] !== void 0) fail(`Unknown field ${JSON.stringify(key)} (the fields are ${[...known].join(", ")}).`);
          }
        }
      }
      if (!open) return;
      let count = groups.length;
      while (count > 0 && empty(groups[count - 1], rec)) count -= 1;
      o.golomb(count, 0);
      for (let g = 0; g < count; g += 1) {
        const s = scratch.pop() ?? new BitWriter(64);
        s.reset();
        const t0 = x.text.length;
        for (const f of groups[g]) wr(f.c, s, rec[f.name], x, f.name);
        o.golomb(s.length, 0);
        o.golomb((x.text.length - t0) / 8, 0);
        o.append(s);
        scratch.push(s);
      }
    },
    r(i, x) {
      const out = {};
      if (x.trace !== null || proto) {
        for (let k = 0; k < fs.length; k += 1) {
          const f = fs[k];
          const v = rd(f.c, i, x, f.name);
          if (v !== void 0 || !f.optional) put(out, f.name, v);
        }
      } else {
        let k = 0;
        try {
          for (; k < fs.length; k += 1) {
            const f = fs[k];
            const v = f.c.r(i, x);
            if (v !== void 0 || !f.optional) out[f.name] = v;
          }
        } catch (e) {
          throw under(e, fs[k].name, null);
        }
      }
      if (!open) return out;
      const s0 = i.at;
      const count = i.golomb(0);
      if (x.trace) meta(x, "groups", s0, i, count, `${count} extension group${count === 1 ? "" : "s"}`);
      for (let g = 0; g < Math.max(count, groups.length); g += 1) {
        const group = groups[g];
        if (g >= count) {
          for (const f of group) if (f.node.kind === "default") out[f.name] = structuredClone(f.node.value);
          continue;
        }
        const s1 = i.at;
        const len2 = i.golomb(0);
        const textLen = i.golomb(0);
        if (x.trace) meta(x, `group ${g + 1}`, s1, i, len2, `${len2} bits, ${textLen} bytes of text`);
        const start = i.at;
        const t0 = x.tr.at;
        if (!group) {
          i.skip(len2);
          x.tr.skip(textLen * 8);
          if (x.trace) {
            meta(x, `group ${g + 1} (unknown)`, start, i, null, "skipped: a newer schema's fields");
            if (textLen) x.trace.meta(`group ${g + 1} text (unknown)`, t0, textLen * 8, null, "skipped");
          }
          continue;
        }
        for (const f of group) {
          const v = rd(f.c, i, x, f.name);
          if (v !== void 0 || !f.optional) out[f.name] = v;
        }
        if (i.at - start !== len2) fail(`Extension group ${g + 1} is ${len2} bits long but its fields read ${i.at - start}.`);
        if (x.tr.at - t0 !== textLen * 8) fail(`Extension group ${g + 1} has ${textLen} bytes of text but its fields read ${(x.tr.at - t0) / 8}.`);
      }
      return out;
    }
  };
}
var DYN_TABLE = "str";
var DYN_NUMS = "$dyn";
function dynCodec(n) {
  const str = compile({ kind: "ref", table: DYN_TABLE, packHex: false }, []);
  const w = (o, v, x) => {
    if (v === null) {
      o.bits(0, 3);
      return;
    }
    switch (typeof v) {
      case "boolean":
        o.bits(v ? 2 : 1, 3);
        return;
      case "number":
        if (Number.isSafeInteger(v) && !Object.is(v, -0) && Math.abs(v) <= 2 ** 51) {
          o.bits(3, 3);
          o.golomb(zig(v), 0);
          return;
        }
        o.bits(4, 3);
        {
          const t = x.tables.numbers(DYN_NUMS);
          const at = t.index.get(v);
          if (at !== void 0) {
            o.bits(0, 2);
            o.bits(at, bitsFor(t.list.length));
            return;
          }
          writeNum(o, v, 2);
          t.index.set(v, t.list.length);
          t.list.push(v);
        }
        return;
      case "string":
        o.bits(5, 3);
        str.w(o, v, x);
        return;
      case "object": {
        if (Array.isArray(v)) {
          o.bits(6, 3);
          o.golomb(v.length, 0);
          for (let k = 0; k < v.length; k += 1) {
            try {
              w(o, v[k], x);
            } catch (e) {
              throw under(e, k, null);
            }
          }
          return;
        }
        if (ArrayBuffer.isView(v)) fail("A typed array isn't JSON-like (dyn): give an array, or a typed schema.");
        const rec = v;
        const keys = Object.keys(rec).filter((k) => rec[k] !== void 0);
        o.bits(7, 3);
        const t = x.tables.shapes(DYN_NUMS);
        const sig = JSON.stringify(keys);
        const at = keys.length ? t.index.get(sig) : void 0;
        if (at !== void 0) {
          o.bool(true);
          o.bits(at, bitsFor(t.list.length));
        } else {
          o.bool(false);
          o.golomb(keys.length, 0);
          for (const k of keys) str.w(o, k, x);
          if (keys.length) {
            t.index.set(sig, t.list.length);
            t.list.push(keys);
          }
        }
        for (const k of keys) {
          try {
            w(o, rec[k], x);
          } catch (e) {
            throw under(e, k, null);
          }
        }
        return;
      }
      default:
        fail(`${typeof v} isn't JSON-like (dyn).`);
    }
  };
  const TAGS = ["null", "false", "true", "int", "number", "string", "array", "object"];
  const r = (i, x) => {
    const s = i.at;
    const tag = i.bits(3);
    if (x.trace) meta(x, "type", s, i, TAGS[tag], TAGS[tag]);
    switch (tag) {
      case 0:
        return null;
      case 1:
        return false;
      case 2:
        return true;
      case 3:
        return unzig(i.golomb(0));
      case 4: {
        const s1 = i.at;
        const k = i.bits(2);
        const t = x.tables.numbers(DYN_NUMS);
        if (k === 0) {
          const at = i.bits(bitsFor(t.list.length));
          if (x.trace) meta(x, "repeat", s1, i, at, `the number #${at} again`);
          if (at >= t.list.length) fail(`The number #${at} again, of ${t.list.length}.`);
          return t.list[at];
        }
        if (x.trace) meta(x, "kind", s1, i, NUM_KINDS[k], "");
        const v = readNum(i, k);
        if (t.index.has(v)) fail("A number written again in full (not canonical: it repeats by index).");
        t.index.set(v, t.list.length);
        t.list.push(v);
        return v;
      }
      case 5:
        return str.r(i, x);
      case 6: {
        const s1 = i.at;
        const len2 = i.golomb(0);
        if (x.trace) meta(x, "length", s1, i, len2, `${len2} items`);
        const out = new Array(len2);
        for (let k = 0; k < len2; k += 1) out[k] = x.trace ? rd(self, i, x, k) : r(i, x);
        return out;
      }
      default: {
        const t = x.tables.shapes(DYN_NUMS);
        const s1 = i.at;
        let keys;
        if (i.bool()) {
          const at = i.bits(bitsFor(t.list.length));
          if (at >= t.list.length) fail(`Object shape #${at} of ${t.list.length}.`);
          keys = t.list[at];
          if (x.trace) meta(x, "shape", s1, i, at, `shaped like object #${at}: ${keys.length} keys`);
        } else {
          const count = i.golomb(0);
          if (x.trace) meta(x, "keys", s1, i, count, `${count} keys, a new shape`);
          keys = [];
          for (let k = 0; k < count; k += 1) {
            const key = str.r(i, x);
            if (keys.includes(key)) fail(`The key ${JSON.stringify(key)} is in the object twice.`);
            keys.push(key);
          }
          if (count) {
            const sig = JSON.stringify(keys);
            if (t.index.has(sig)) fail("An object's keys written again in full (not canonical: its shape repeats by index).");
            t.index.set(sig, t.list.length);
            t.list.push(keys);
          }
        }
        const out = {};
        for (const key of keys) put(out, key, x.trace ? rd(self, i, x, key) : r(i, x));
        return out;
      }
    }
  };
  const self = { node: n, w, r };
  return self;
}
var WRITER = new BitWriter(4096);
var TEXT = new BitWriter(1024);
var OUT = new BitWriter(4096);
var writerBusy = false;
function writeBody(o, c, value, x, bits) {
  c.w(bits, value, x);
  const text = x.text;
  let n = text.length / 8;
  o.align();
  do {
    const b = n % 128;
    n = Math.floor(n / 128);
    o.bits(b | (n > 0 ? 128 : 0), 8);
  } while (n > 0);
  o.append(bits);
  o.align();
  o.append(text);
}
function encodeRaw(schema, value, opts = {}) {
  const reuse = !writerBusy;
  const bits = reuse ? WRITER : new BitWriter(256);
  const text = reuse ? TEXT : new BitWriter(64);
  const out = reuse ? OUT : new BitWriter(256);
  if (reuse) {
    writerBusy = true;
    bits.reset();
    text.reset();
    out.reset();
  }
  try {
    writeBody(out, compiled2(schema), value, { tables: opts.tables ?? new Tables(), trace: null, strict: opts.strict ?? true, text, tr: null, last: null }, bits);
    return out.finish();
  } finally {
    if (reuse) writerBusy = false;
  }
}

// ../../../../../../keel-engine/packages/codec/src/sha256.ts
var K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
function sha256(data) {
  const h = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225]);
  const len2 = data.length;
  const padded = new Uint8Array(Math.ceil((len2 + 9) / 64) * 64);
  padded.set(data);
  padded[len2] = 128;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(len2 * 8 / 2 ** 32));
  view.setUint32(padded.length - 4, len2 * 8 >>> 0);
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const a2 = w[i - 15], b3 = w[i - 2];
      const s0 = (a2 >>> 7 | a2 << 25) ^ (a2 >>> 18 | a2 << 14) ^ a2 >>> 3;
      const s1 = (b3 >>> 17 | b3 << 15) ^ (b3 >>> 19 | b3 << 13) ^ b3 >>> 10;
      w[i] = w[i - 16] + s0 + w[i - 7] + s1 >>> 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let i = 0; i < 64; i += 1) {
      const S1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
      const ch = e & f ^ ~e & g;
      const t1 = hh + S1 + ch + K[i] + w[i] >>> 0;
      const S0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
      const maj = a & b ^ a & c ^ b & c;
      const t2 = S0 + maj >>> 0;
      hh = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    h[0] = h[0] + a >>> 0;
    h[1] = h[1] + b >>> 0;
    h[2] = h[2] + c >>> 0;
    h[3] = h[3] + d >>> 0;
    h[4] = h[4] + e >>> 0;
    h[5] = h[5] + f >>> 0;
    h[6] = h[6] + g >>> 0;
    h[7] = h[7] + hh >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i += 1) ov.setUint32(i * 4, h[i]);
  return out;
}
var toHex2 = (b) => {
  let s = "";
  for (let i = 0; i < b.length; i += 1) s += b[i].toString(16).padStart(2, "0");
  return s;
};

// ../../../../../../keel-engine/packages/codec/src/canonical.ts
var NAMES = "$names";
var field = (self) => struct({ name: ref(NAMES), type: self });
var SCHEMA_SCHEMA = named("keel/codec/schema", recursive((self) => union("kind", {
  uint: struct({ bits: uint(6) }),
  int: struct({ bits: uint(6) }),
  bool: struct({}),
  fixed: struct({ min: num(), max: num(), step: num(), off: enumOf(["round", "strict", "exact"]), k: int(7), delta: bool() }),
  float: struct({ bits: enumOf([16, 32, 64]) }),
  enum: struct({ values: array(alt([string(), num(), bool()])), capacity: varuint(), open: bool(), other: bool() }),
  varuint: struct({ k: uint(5), group: uint(5) }),
  varint: struct({ k: uint(5), group: uint(5) }),
  string: struct({ max: varuint(), packHex: bool() }),
  ref: struct({ table: ref(NAMES), packHex: bool() }),
  bytes: struct({ length: varuint() }),
  hex: struct({ bytes: varuint() }),
  biguint: struct({ bits: uint(9) }),
  array: struct({ of: self, length: varuint(), max: varuint() }),
  optional: struct({ of: self }),
  nullable: struct({ of: self }),
  default: struct({ of: self, value: bytes() }),
  struct: struct({ fields: array(field(self)), open: bool(), ext: array(array(field(self))) }),
  tuple: struct({ items: array(self) }),
  union: struct({ tag: ref(NAMES), variants: array(field(self)), capacity: varuint() }),
  alt: struct({ of: array(self) }),
  map: struct({ key: self, value: self, order: enumOf(["sorted", "kept"]) }),
  delta: struct({ of: self, k: uint(5) }),
  runs: struct({ of: self }),
  planes: struct({ bits: uint(6) }),
  dyn: struct({}),
  num: struct({}),
  const: struct({ value: dyn() }),
  named: struct({ name: ref(NAMES), version: varuint(), doc: string(), of: self }),
  rec: struct({ of: self }),
  self: struct({ depth: varuint() }),
  lz: struct({ of: self, min: uint(4) }),
  grow: struct({ base: self, of: self })
}, { capacity: 64 })), { doc: "Every schema, as data: a document can carry its own." });
function toRecord(type, { docs = true } = {}) {
  const walk = (n) => {
    const fl = (fs) => fs.map((f) => ({ name: f.name, type: walk(f.type) }));
    switch (n.kind) {
      case "uint":
      case "int":
      case "biguint":
      case "planes":
        return { kind: n.kind, bits: n.bits };
      case "bool":
      case "dyn":
      case "num":
        return { kind: n.kind };
      case "fixed":
        return { kind: "fixed", min: n.min, max: n.max, step: n.step, off: n.off, k: n.k, delta: n.delta };
      case "float":
        return { kind: "float", bits: n.bits };
      case "enum":
        return { kind: "enum", values: [...n.values], capacity: n.capacity, open: n.open, other: n.other };
      case "varuint":
      case "varint":
        return { kind: n.kind, k: n.k, group: n.group };
      case "string":
        return { kind: "string", max: n.max, packHex: n.packHex };
      case "ref":
        return { kind: "ref", table: n.table, packHex: n.packHex };
      case "bytes":
        return { kind: "bytes", length: n.length };
      case "hex":
        return { kind: "hex", bytes: n.bytes };
      case "array":
        return { kind: "array", of: walk(n.of), length: n.length, max: n.max };
      case "optional":
      case "nullable":
      case "runs":
      case "rec":
        return { kind: n.kind, of: walk(n.of) };
      case "default": {
        let value;
        try {
          value = encodeRaw(n.of, n.value);
        } catch (e) {
          throw new SchemaError(`A default can't be written as data: ${e.message}`);
        }
        return { kind: "default", of: walk(n.of), value };
      }
      case "struct":
        return { kind: "struct", fields: fl(n.fields), open: n.open, ext: n.ext.map((g) => fl(g)) };
      case "tuple":
        return { kind: "tuple", items: n.items.map((x) => walk(x)) };
      case "union":
        return { kind: "union", tag: n.tag, variants: fl(n.variants), capacity: n.capacity };
      case "alt":
        return { kind: "alt", of: n.of.map((x) => walk(x)) };
      case "map":
        return { kind: "map", key: walk(n.key), value: walk(n.value), order: n.order };
      case "delta":
        return { kind: "delta", of: walk(n.of), k: n.k };
      case "const":
        return { kind: "const", value: n.value };
      case "named":
        return { kind: "named", name: n.name, version: n.version, doc: docs ? n.doc : "", of: walk(n.of) };
      case "self":
        return { kind: "self", depth: n.depth };
      case "lz":
        return { kind: "lz", of: walk(n.of), min: n.min };
      case "grow":
        return { kind: "grow", base: walk(n.base), of: walk(n.of) };
    }
  };
  return walk(type);
}
var encodeSchema = (type, opts = {}) => encodeRaw(SCHEMA_SCHEMA, toRecord(type, opts));
var IDS = /* @__PURE__ */ new WeakMap();
function schemaId(type) {
  const have = IDS.get(type);
  if (have) return have;
  const id2 = toHex2(sha256(encodeSchema(type, { docs: false })));
  IDS.set(type, id2);
  return id2;
}
function schemaName(type) {
  const n = type;
  return n.kind === "named" ? { name: n.name, version: n.version, doc: n.doc } : null;
}

// ../../../../../../keel-engine/packages/codec/src/document.ts
function createRegistry() {
  const byId = /* @__PURE__ */ new Map();
  const byKey = /* @__PURE__ */ new Map();
  const reg = {
    register(schema, alias) {
      const id2 = schemaId(schema);
      const named2 = schemaName(schema);
      const have = byId.get(id2);
      const aliases = new Set(have?.aliases ?? []);
      if (alias) {
        const other = byKey.get(alias);
        if (other && other.id !== id2) throw new RangeError(`The name ${alias} is already schema ${other.short}.`);
        aliases.add(alias);
      }
      const entry = { id: id2, short: id2.slice(0, 8), schema: have?.schema ?? schema, name: named2?.name ?? null, version: named2?.version ?? null, aliases: [...aliases] };
      const clash = byKey.get(entry.short);
      if (clash && clash.id !== id2) throw new RangeError(`Two schemas share the short id ${entry.short} (${clash.id} and ${id2}): a header can't tell them apart.`);
      byId.set(id2, entry);
      for (const k of [id2, entry.short, ...aliases, ...named2 ? [`${named2.name}@${named2.version}`] : []]) byKey.set(k, entry);
      return id2;
    },
    get: (key) => byKey.get(key),
    has: (key) => byKey.has(key),
    list: () => [...byId.values()]
  };
  return reg;
}
var defaultRegistry = createRegistry();
function registerSchema(a, b) {
  return typeof a === "string" ? defaultRegistry.register(b, a) : defaultRegistry.register(a);
}

// ../../../../../../keel-engine/packages/ui/src/schemas.ts
var hue = fixed(0, 360, 0.01, { off: "exact" });
var share = fixed(0, 1, 0.01, { off: "exact" });
var FONT_PARAMS = struct({
  width: share,
  xHeight: share,
  descender: share,
  round: uint(2),
  stroke: fixed(0, 0.5, 0.01, { off: "exact" }),
  serif: enumOf(SERIFS, { capacity: 8 }),
  slant: uint(1),
  tracking: uint(2),
  zero: enumOf(ZEROS, { capacity: 4 }),
  ascend: uint(1),
  soft: enumOf(SOFTS, { capacity: 4 }),
  capWidth: uint(2)
});
var FONT_PINS = struct({
  width: optional(share),
  xHeight: optional(share),
  descender: optional(share),
  round: optional(uint(2)),
  stroke: optional(fixed(0, 0.5, 0.01, { off: "exact" })),
  serif: optional(enumOf(SERIFS, { capacity: 8 })),
  slant: optional(uint(1)),
  tracking: optional(uint(2)),
  zero: optional(enumOf(ZEROS, { capacity: 4 })),
  ascend: optional(uint(1)),
  soft: optional(enumOf(SOFTS, { capacity: 4 })),
  capWidth: optional(uint(2))
});
var THEME_PINS = struct({
  tone: optional(enumOf(TONES, { capacity: 4 })),
  hue: optional(hue),
  accentHue: optional(hue),
  chroma: optional(fixed(0, 0.5, 1e-3, { off: "exact" })),
  corner: optional(enumOf(CORNERS, { capacity: 16 })),
  radius: optional(uint(3)),
  border: optional(uint(2)),
  bevel: optional(uint(2)),
  fill: optional(enumOf(FILLS, { capacity: 8 })),
  screen: optional(enumOf(SCREEN_IDS, { capacity: 32 })),
  shadow: optional(uint(2)),
  glow: optional(uint(2)),
  motion: optional(enumOf(MOTIONS, { capacity: 8 })),
  body: optional(uint(5)),
  caps: optional(bool()),
  font: optional(FONT_PINS),
  icon: optional(enumOf(ICON_STYLES, { capacity: 8 })),
  unit: optional(uint(4)),
  teams: optional(uint(5)),
  teamHues: optional(array(hue, { max: 24 }))
}, { open: true });
var UI_THEME = named("keel/ui/theme", struct({
  generator: ref("modules"),
  seed: seedText,
  culture: enumOf(CULTURES, { capacity: 16 }),
  pins: THEME_PINS
}, { open: true }), { doc: "A UI theme as its recipe: generator@version, seed, culture and sparse pins." });
var GLYPH = struct({
  code: fixed(0, 1114111, 1, { k: 2, delta: true }),
  w: uint(6),
  h: uint(6),
  ox: varint(),
  oy: varint(),
  adv: uint(7),
  bits: planes(1)
});
var UI_FONT = named("keel/ui/font", struct({
  name: string(),
  size: uint(6),
  ascent: uint(7),
  descent: uint(6),
  lineHeight: uint(7),
  source: enumOf(["generated", "ttf", "bmfont", "grid", "browser", "codec"], { capacity: 16 }),
  glyphs: array(GLYPH),
  kern: array(tuple([varuint({ k: 5 }), varuint({ k: 5 }), varint()]))
}, { open: true }), { doc: "A pixel font: metrics, 1-bit glyphs, kerning pairs." });
var UI_FONT_RECIPE = named("keel/ui/font-recipe", struct({
  generator: ref("modules"),
  params: FONT_PARAMS,
  sizes: array(uint(6), { max: 31 })
}, { open: true }), { doc: "A generated pixel font as its recipe: the family's parameters and the sizes used." });
var size2 = alt([varint(), ref("sizes")]);
var u = () => optional(varuint());
function nodeSchema(driving) {
  return recursive((self) => {
    const legacy = extend(struct({
      type: enumOf(driving ? WIDGETS : WIDGETS.slice(0, -1), { capacity: 64 }),
      id: optional(ref("ids")),
      anchor: optional(enumOf(ANCHORS, { capacity: 16 })),
      x: optional(varint()),
      y: optional(varint()),
      w: optional(size2),
      h: optional(size2),
      minW: u(),
      maxW: u(),
      minH: u(),
      maxH: u(),
      dir: optional(enumOf(["free", "row", "col", "grid"], { capacity: 8 })),
      gap: u(),
      pad: u(),
      align: optional(enumOf(["start", "center", "end", "stretch"], { capacity: 8 })),
      justify: optional(enumOf(["start", "center", "end", "between"], { capacity: 8 })),
      grow: u(),
      cols: u(),
      cellH: u(),
      hidden: optional(bool()),
      frame: optional(enumOf([...FRAME_KINDS, "none"], { capacity: 16 })),
      mesh: optional(bool()),
      tone: optional(ref("tones")),
      font: optional(enumOf(["small", "body", "title", "display"], { capacity: 8 })),
      textAlign: optional(enumOf(["left", "center", "right"], { capacity: 4 })),
      wrap: optional(bool()),
      maxLines: u(),
      caps: optional(bool()),
      shadow: optional(bool()),
      text: optional(string()),
      title: optional(string()),
      icon: optional(ref("icons")),
      iconSize: u(),
      value: optional(num()),
      max: optional(num()),
      segments: u(),
      trail: optional(num()),
      hotkey: optional(ref("keys")),
      cooldown: optional(fixed(0, 1, 1 / 64, { off: "exact" })),
      count: u(),
      disabled: optional(bool()),
      active: optional(bool()),
      primary: optional(bool()),
      items: optional(array(string())),
      selected: optional(varint()),
      view: optional(tuple([fixed(0, 1, 1 / 1024, { off: "exact" }), fixed(0, 1, 1 / 1024, { off: "exact" }), fixed(0, 1, 1 / 1024, { off: "exact" }), fixed(0, 1, 1 / 1024, { off: "exact" })])),
      tip: optional(string()),
      focusable: optional(bool()),
      action: optional(ref("actions")),
      hole: optional(bool()),
      children: optional(array(self))
    }, { open: true }), {
      // (Added later, as an extension group: old records read as before.)
      tipDock: optional(bool()),
      trim: optional(string()),
      edge: optional(string()),
      scrim: optional(enumOf(["solid", "dither"], { capacity: 4 })),
      reflow: optional(bool()),
      iconFill: optional(bool()),
      hp: optional(num())
    });
    return driving ? extend(legacy, {
      // A separate extension group keeps the original group's field bitmap unchanged.
      drivingKind: optional(enumOf(DRIVING_KINDS, { capacity: 16 })),
      drivingVariant: optional(enumOf(DRIVING_VARIANTS, { capacity: 4 })),
      secondaryValue: optional(num()),
      secondaryMax: optional(num()),
      drivingRedline: optional(num())
    }) : legacy;
  });
}
var UI_NODE = nodeSchema(true);
var LEGACY_UI_NODE = nodeSchema(false);
var screenSchema = (root, version) => named("keel/ui/screen", struct({
  screen: string(),
  theme: optional(struct({ generator: ref("modules"), seed: seedText, culture: enumOf(CULTURES, { capacity: 16 }), pins: THEME_PINS }, { open: true })),
  root
}, { open: true }), { version, doc: "A UI screen: its layout tree (and the theme recipe it was made with)." });
var UI_SCREEN_V1 = screenSchema(LEGACY_UI_NODE, 1);
var UI_SCREEN = screenSchema(UI_NODE, 2);
registerSchema(UI_SCREEN_V1);
registerSchema(UI_SCREEN);

// ../../../../../../keel-engine/packages/ui/src/import/inflate.ts
function build(lengths, off, n) {
  const counts = new Uint16Array(16);
  const symbols = new Uint16Array(n);
  for (let i = 0; i < n; i += 1) counts[lengths[off + i]] += 1;
  counts[0] = 0;
  const offs = new Uint16Array(16);
  for (let i = 1; i < 16; i += 1) offs[i] = offs[i - 1] + counts[i - 1];
  for (let i = 0; i < n; i += 1) {
    const l = lengths[off + i];
    if (l) symbols[offs[l]++] = i;
  }
  return { counts, symbols };
}
var FIXED = (() => {
  const l = new Uint8Array(288);
  l.fill(8, 0, 144);
  l.fill(9, 144, 256);
  l.fill(7, 256, 280);
  l.fill(8, 280, 288);
  const d = new Uint8Array(30).fill(5);
  return { lit: build(l, 0, 288), dist: build(d, 0, 30) };
})();

// ../../../../../../keel-engine/packages/ui/src/import/png.ts
var CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

// ../../../../../../keel-engine/packages/ui/src/import/ttf.ts
var DEFAULT_CODES = [...Array.from({ length: 95 }, (_, i) => 32 + i), 8230, 8226, 215, 176, 8592, 8593, 8594, 8595];

// ../../../../../../keel-engine/packages/react/src/design.ts
var DESIGN_LANGUAGE = Object.freeze({
  id: "keel/react-design@1",
  rules: ["Canonical KEEL generators and renderer own the scene.", "React binds state, lifecycle and accessible controls to the same world.", "Controls stay on their authored world surfaces; DOM counterparts retain their placement.", "Theme recipes provide semantic palette, spacing, type, frames and motion.", "Pixel scenes use integer scale and nearest-neighbour sampling.", "Project-owned fonts and assets retain provenance.", "Seed and frame clocks are explicit; captures export real source geometry and state."],
  references: ["REDLINE: React host callbacks into the shared engine world.", "CRUCIBLE: React state controls a genuine KEEL pixel-rendered package room."],
  limitations: ["DOM primitives expose semantic theme roles, not every pixel UI frame decoration.", "A CSS font must be supplied by the project; generated pixel glyphs are available through keel/ui.", "The React adapter is host tooling, not an onchain registered React runtime."]
});
function themeTokens(theme, scale2 = 2) {
  if (!Number.isInteger(scale2) || scale2 < 1 || scale2 > 16) throw new RangeError("UI scale must be an integer from 1 to 16.");
  const p = theme.palette, hex2 = (r, i) => toHex(r[i] ?? r[0] ?? 0);
  const values = {
    "--keel-surface": hex2(p.surface, 2),
    "--keel-raised": hex2(p.surface, 3),
    "--keel-ink": hex2(p.ink, 1),
    "--keel-muted": hex2(p.ink, 0),
    "--keel-accent": hex2(p.accent, 2),
    "--keel-on-accent": toHex(p.onAccent),
    "--keel-outline": toHex(p.outline),
    "--keel-good": hex2(p.good, 2),
    "--keel-warn": hex2(p.warn, 2),
    "--keel-bad": hex2(p.bad, 2),
    "--keel-px": `${scale2}px`,
    "--keel-border": `${theme.frame.border * scale2}px`,
    "--keel-pad": `${theme.space.pad * scale2}px`,
    "--keel-gap": `${theme.space.gap * scale2}px`,
    "--keel-body": `${theme.type.body * scale2}px`,
    "--keel-motion": `${theme.motion.ms}ms`
  };
  for (const [name, ramp3] of Object.entries(p)) if (Array.isArray(ramp3) && typeof ramp3[0] === "number") ramp3.forEach((value, i) => {
    values[`--keel-${name}-${i}`] = toHex(value);
  });
  return values;
}
function recipeTheme(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Theme recipe must be an object.");
  const value = input;
  for (const key of Object.keys(value)) if (!["seed", "culture", "pins"].includes(key)) throw new TypeError(`Unknown recipe field ${key}.`);
  const seed = value.seed ?? "keel/react", culture = value.culture ?? "clean";
  if (typeof seed !== "string" || seed.length > 256 || !CULTURES.includes(culture)) throw new TypeError("Invalid seed or culture.");
  const pins = value.pins ?? {};
  if (!pins || typeof pins !== "object" || Array.isArray(pins)) throw new TypeError("Pins must be an object.");
  const allowed = { tone: ["dark", "light"], hue: [0, 360], accentHue: [0, 360], motion: ["snappy", "bouncy", "none"], corner: ["flat", "bevel", "inset", "notched", "rivets", "glow", "round"], body: [5, 16], unit: [1, 8], border: [1, 3], bevel: [0, 2], fill: ["solid", "dither", "gradient", "scan"], shadow: [0, 2], glow: [0, 2], caps: [true, false] };
  for (const [key, pin] of Object.entries(pins)) {
    const range = allowed[key];
    if (!range) throw new TypeError(`Unsupported pin ${key}.`);
    if (typeof range[0] === "number") {
      if (typeof pin !== "number" || !Number.isFinite(pin) || pin < range[0] || pin > range[1] || !key.endsWith("Hue") && key !== "hue" && !Number.isInteger(pin)) throw new TypeError(`Invalid pin ${key}.`);
    } else if (!range.includes(pin)) throw new TypeError(`Invalid pin ${key}.`);
  }
  return themeOf({ generator: THEME_GENERATOR, seed, culture, pins });
}
export {
  recipeTheme,
  themeTokens
};
