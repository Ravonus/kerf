import './icon-schema.mjs';
import {
  BitError,
  BitWriter,
  asNode,
  bad,
  bitsFor,
  fieldsOf,
  fixed,
  node,
  num,
  ref,
  uint,
  whole,
} from './icon-schema.mjs';

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

// packages/codec/src/schemas/common.ts
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

// packages/codec/src/codec-primitives.ts
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

// packages/codec/src/codec.ts

function compileUint(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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

function compileInt(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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

function compileBool(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
return {
        node: n,
        w(o, v) {
          if (typeof v !== "boolean") fail(`${describe(v)} is not a boolean.`);
          o.bool(v);
        },
        r: (i) => i.bool()
      };
}

export {
  CodecError,
  NUM_KINDS,
  SCRATCH,
  Tables,
  alt,
  categoryOf,
  compileBool,
  compileInt,
  compileUint,
  compiled,
  describe,
  extend,
  fail,
  fresh,
  fromUtf8,
  gridOf,
  intCheck,
  lastOf,
  meta,
  named,
  planes,
  put,
  rd,
  readNum,
  recursive,
  same,
  seedText,
  tuple,
  under,
  union,
  unzig,
  utf8,
  wellFormed,
  wr,
  writeNum,
  zig,
};
