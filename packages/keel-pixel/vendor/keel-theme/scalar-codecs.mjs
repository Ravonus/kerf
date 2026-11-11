import './schema-codec.mjs';
import {
  BitWriter,
  SchemaError,
  bitsFor,
  fromHalf,
  toHalf,
} from './icon-schema.mjs';
import {
  NUM_KINDS,
  describe,
  fail,
  fresh,
  fromUtf8,
  gridOf,
  intCheck,
  lastOf,
  meta,
  rd,
  readNum,
  same,
  under,
  unzig,
  utf8,
  wellFormed,
  wr,
  writeNum,
  zig,
} from './schema-codec.mjs';


function compileFixed(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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

function compileFloat(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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

function compileVarint(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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

function compileNum(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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
}

function compileBiguint(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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

function compileEnum(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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

function compileString(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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

function compileRef(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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

function compileBytes(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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
}

function compileHex(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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

function compileConst(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
return {
        node: n,
        w(_o, v) {
          if (!same(v, n.value)) fail(`${describe(v)} is not the constant ${JSON.stringify(n.value)}.`);
        },
        r: () => structuredClone(n.value)
      };
}

function compileDyn(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
return dynCodec(n, compile);
}

function compileArray(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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

function compileGrow(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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

function compileNullable(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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

function compileDefault(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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

function compileStruct(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
return structCodec(n.fields, n.open, n.ext, recs, n, null, compile);
}

function compileTuple(n, recs, compile, dynCodec, structCodec, holds, valueCategory) {
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

export {
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
};
