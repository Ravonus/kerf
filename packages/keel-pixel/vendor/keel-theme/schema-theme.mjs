import './codec-runtime.mjs';
import {
  SCREEN_IDS,
  SERIFS,
  SOFTS,
  ZEROS,
  toHex,
} from './color-font.mjs';
import {
  CORNERS,
  CULTURES,
  FILLS,
  FRAME_KINDS,
  ICON_STYLES,
  MOTIONS,
  THEME_GENERATOR,
  TONES,
  themeOf,
} from './glyph-theme.mjs';
import {
  ANCHORS,
  DRIVING_KINDS,
  DRIVING_VARIANTS,
  SchemaError,
  WIDGETS,
  array,
  bool,
  bytes,
  dyn,
  enumOf,
  fixed,
  int,
  num,
  optional,
  ref,
  string,
  struct,
  uint,
  varint,
  varuint,
} from './icon-schema.mjs';
import {
  alt,
  extend,
  named,
  planes,
  recursive,
  seedText,
  tuple,
  union,
} from './schema-codec.mjs';
import {
  K,
  encodeRaw,
} from './codec-runtime.mjs';

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

// packages/codec/src/canonical.ts
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

// packages/codec/src/document.ts
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

// packages/ui/src/schemas.ts
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

// packages/ui/src/import/inflate.ts
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

// packages/ui/src/import/png.ts
var CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

// packages/ui/src/import/ttf.ts
var DEFAULT_CODES = [...Array.from({ length: 95 }, (_, i) => 32 + i), 8230, 8226, 215, 176, 8592, 8593, 8594, 8595];

// packages/react/src/design.ts
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
  themeTokens,
};
