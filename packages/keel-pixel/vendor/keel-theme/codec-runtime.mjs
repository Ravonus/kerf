import './collection-codecs.mjs';
import {
  BitWriter,
  bitsFor,
} from './icon-schema.mjs';
import {
  NUM_KINDS,
  Tables,
  categoryOf,
  compileBool,
  compileInt,
  compileUint,
  compiled,
  describe,
  fail,
  meta,
  put,
  rd,
  readNum,
  same,
  under,
  unzig,
  wr,
  writeNum,
  zig,
} from './schema-codec.mjs';
import {
  compileArray,
  compileBiguint,
  compileBytes,
  compileConst,
  compileDefault,
  compileDyn,
  compileEnum,
  compileFixed,
  compileFloat,
  compileGrow,
  compileHex,
  compileNullable,
  compileNum,
  compileRef,
  compileString,
  compileStruct,
  compileTuple,
  compileVarint,
} from './scalar-codecs.mjs';
import {
  compileAlt,
  compileDelta,
  compileLz,
  compileMap,
  compileNamed,
  compilePlanes,
  compileRec,
  compileRuns,
  compileSelf,
  compileUnion,
} from './collection-codecs.mjs';

function compile(n, recs) {
  switch (n.kind) {
    case "uint": return compileUint(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "int": return compileInt(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "bool": return compileBool(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "fixed": return compileFixed(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "float": return compileFloat(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "varuint":
    case "varint": return compileVarint(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "num": return compileNum(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "biguint": return compileBiguint(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "enum": return compileEnum(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "string": return compileString(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "ref": return compileRef(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "bytes": return compileBytes(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "hex": return compileHex(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "const": return compileConst(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "dyn": return compileDyn(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "array": return compileArray(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "grow": return compileGrow(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "optional":
    case "nullable": return compileNullable(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "default": return compileDefault(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "struct": return compileStruct(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "tuple": return compileTuple(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "union": return compileUnion(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "alt": return compileAlt(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "map": return compileMap(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "delta": return compileDelta(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "runs": return compileRuns(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "lz": return compileLz(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "planes": return compilePlanes(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "named": return compileNamed(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "rec": return compileRec(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
    case "self": return compileSelf(n, recs, compile, dynCodec, structCodec, holds, valueCategory);
  }
}
function compiled2(root) {
  return compiled(root, compile);
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
function structWriter(fs, groups, known, tagKey, open, scratch, empty) {
  return function w(o, v, x) {
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
    };
}

function structCodec(fields, open, ext, recs, node2, tagKey, compile) {
  const fs = fields.map((f) => ({ name: f.name, c: compile(f.type, recs), optional: f.type.kind === "optional" }));
  const groups = ext.map((g) => g.map((f) => ({ name: f.name, c: compile(f.type, recs), optional: f.type.kind === "optional", node: f.type })));
  const known = new Set([...fields, ...ext.flat()].map((f) => f.name));
  if (tagKey !== null) known.add(tagKey);
  const proto = known.has("__proto__");
  const scratch = [];
  const empty = (g, v) => g.every((f) => v[f.name] === void 0 || f.node.kind === "default" && same(v[f.name], f.node.value));
  return {
    node: node2,
    w: structWriter(fs, groups, known, tagKey, open, scratch, empty),
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
function writeDynObject(o, v, x, str, w) {
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

function dynWriter(str) {
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
      case "object": return writeDynObject(o, v, x, str, w);
      default:
        fail(`${typeof v} isn't JSON-like (dyn).`);
    }
  };
  return w;
}

function dynReader(str, getSelf) {
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
        for (let k = 0; k < len2; k += 1) out[k] = x.trace ? rd(getSelf(), i, x, k) : r(i, x);
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
        for (const key of keys) put(out, key, x.trace ? rd(getSelf(), i, x, key) : r(i, x));
        return out;
      }
    }
  };
  return r;
}

function dynCodec(n, compile) {
  const str = compile({ kind: "ref", table: DYN_TABLE, packHex: false }, []);
  const w = dynWriter(str);

  const r = dynReader(str, () => self);
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

// packages/codec/src/sha256.ts
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

export {
  K,
  encodeRaw,
};
