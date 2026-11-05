import './scalar-codecs.mjs';
import {
  SchemaError,
  bitsFor,
} from './icon-schema.mjs';
import {
  CodecError,
  SCRATCH,
  categoryOf,
  describe,
  fail,
  gridOf,
  meta,
  put,
  rd,
  same,
  under,
  unzig,
  wr,
  zig,
} from './schema-codec.mjs';


function compileUnion(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
const variants = n.variants.map((f) => {
        const s = f.type;
        return { name: f.name, c: structCodec(s.fields, s.open, s.ext, recs, s, n.tag, compile) };
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

function compileAlt(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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

function compileMap(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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

function compileDelta(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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

function compileRuns(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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

function lzWriter(of, MIN, WINDOW, CHAIN) {
  return function w(o, v, x) {
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
        };
}

function compileLz(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
const of = compile(n.of, recs);
const MIN = n.min;
const WINDOW = 1 << 16;
const CHAIN = 48;
return {
        node: n,
        w: lzWriter(of, MIN, WINDOW, CHAIN),
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

function compilePlanes(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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

function compileNamed(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
const of = compile(n.of, recs);
return { node: n, w: (o, v, x) => of.w(o, v, x), r: (i, x) => of.r(i, x) };
}

function compileRec(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
const fwd = { c: null };
const self = { node: n, w: (o, v, x) => fwd.c.w(o, v, x), r: (i, x) => fwd.c.r(i, x) };
fwd.c = compile(n.of, [...recs, self]);
return self;
}

function compileSelf(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
const target = recs[recs.length - 1 - n.depth];
if (!target) throw new SchemaError(`A self node (depth ${n.depth}) outside its recursive().`);
return { node: n, w: (o, v, x) => target.w(o, v, x), r: (i, x) => target.r(i, x) };
}

export {
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
};
