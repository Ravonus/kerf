// Prop inference (research 44). Facts come from syntax; the types come from whichever checker the host wraps, asked
// about the call sites in the program's own terms. A round writes each component's annotation into its file's shadow;
// the next round sees the types that made possible (a prop forwarded to another inferred component, a component passed
// as a prop). Rounds stop when nothing changes, and a project with nothing to infer never starts a checker.

const { fileFacts, hashOf, MARK } = require('./facts.cjs')
const { inGenerated, shadow, toShadow, toSource } = require('./shadow.cjs')

const ROUNDS = 5
const MAX_LITERALS = 8

const quote = (key) => (/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key))
const unique = (list) => [...new Set(list)]
const union = (list) => {
  const parts = unique(list.filter(Boolean))
  return parts.length
    ? parts.map((t) => (/=>/.test(t) && !/^\(.*\)$/.test(t) ? `(${t})` : t)).join(' | ')
    : null
}
const sameFile = (a, b) => a === b || a.toLowerCase() === b.toLowerCase()
const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1]

class Engine {
  /** @param {{ ts: any, read: (file: string) => string | undefined, routes?: (file: string) => boolean }} options */
  constructor({ ts, read, routes }) {
    this.ts = ts
    this.read = read
    this.routes = routes ?? ((f) => /\/src\/routes\//.test(f))
    this.facts = new Map()
    this.texts = new Map()
    this.maps = new Map() // file → shadow, for files that differ from their source
    this.state = new Map() // comp id → { type, keys, sites, ... }
    this.findings = new Map() // file → engine diagnostics
    this.typed = new Map() // file → what the checker said about its sites, until the file or a shadow it reads moves
    this.flowCache = new Map()
    this.diags = new Map() // file → the checker's errors for one shadow text
    this.touched = new Set() // files whose errors the last run may have moved
    this.stats = { rounds: 0, queries: 0, parses: 0 }
  }

  /** New text for a file. @returns whether anything about it changed */
  set(file, text = this.read(file)) {
    if (text === undefined) {
      const had = this.facts.delete(file)
      this.texts.delete(file)
      this.maps.delete(file)
      this.typed.delete(file)
      this.flowCache.delete(file)
      return had
    }
    const before = this.facts.get(file)
    this.texts.set(file, text)
    const hash = hashOf(text)
    if (before?.hash === hash) return false
    this.stats.parses++
    this.facts.set(file, fileFacts(this.ts, file, text))
    return true
  }

  comps() {
    return [...this.facts.values()].flatMap((f) => f.comps)
  }
  /** Facts that need a shadow at all: most projects have none, and then no checker starts. */
  needed() {
    return [...this.facts.values()].some(
      (f) => f.comps.length || f.sites.some((s) => s.attrs.some((a) => a.bind)),
    )
  }

  /** Files with a component or a site of one that import `file`: what they pass may have changed type. */
  dependents(file) {
    const base = file.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '')
    const names = new Set(this.comps().map((c) => c.name))
    const out = new Set()
    for (const f of this.facts.values()) {
      if (!f.comps.length && !f.sites.some((s) => names.has(s.tag))) continue
      for (const { from } of f.imports.values())
        if (from === base || from.endsWith(`/${base}`)) {
          out.add(f.file)
          break
        }
    }
    return out
  }

  /** Whether a saved file can move anything: it holds a component or a site of one, or such a file imports it. */
  relevant(file) {
    if (!this.needed()) return false
    const facts = this.facts.get(file)
    if (!facts || facts.comps.length || facts.sites.some((s) => s.attrs.some((a) => a.bind)))
      return true
    const names = new Set(this.comps().map((c) => c.name))
    return (
      facts.sites.some((s) => names.has(s.tag) || (this.flowing?.has(file) ?? false)) ||
      this.dependents(file).size > 0
    )
  }

  /** `comp` for a tag that needs no checker: a name in the same file, or a local wrap of one. */
  direct(facts, site) {
    const names = new Set(),
      todo = [site.tag.split('.')[0]]
    while (todo.length) {
      const n = todo.pop()
      if (names.has(n)) continue
      names.add(n)
      todo.push(...(facts.wraps.get(n) ?? []))
    }
    return facts.comps.filter((c) => names.has(c.name))
  }

  shadowOf(file) {
    return this.maps.get(file)
  }

  edits(facts) {
    const edits = []
    for (const site of facts.sites)
      for (const a of site.attrs) {
        if (!a.bind) continue
        if (a.raw)
          edits.push(
            { start: a.raw[0], end: a.raw[0] + 5, text: '' },
            { start: a.span[1], end: a.span[1], text: '.value' },
          )
      }
    for (const c of facts.comps) {
      const type = this.state.get(c.id)?.type ?? 'any'
      const note = `: ${type}`
      if (c.written) edits.push({ start: c.written[0], end: c.written[1], text: note })
      else if (c.parens) edits.push({ start: c.nameEnd, end: c.nameEnd, text: note })
      else
        edits.push(
          { start: c.paramSpan[0], end: c.paramSpan[0], text: '(' },
          { start: c.nameEnd, end: c.nameEnd, text: `${note})` },
        )
    }
    return edits
  }

  /** Rewrite the files whose shadow moved, and tell the host. */
  publish(host, only) {
    const changed = new Map()
    for (const [file, facts] of this.facts) {
      if (only && !only.has(file)) continue
      if (!facts.comps.length && !facts.sites.some((s) => s.attrs.some((a) => a.bind))) {
        if (this.maps.delete(file)) changed.set(file, this.texts.get(file))
        continue
      }
      const map = shadow(this.texts.get(file), this.edits(facts))
      if (this.maps.get(file)?.text !== map.text) {
        this.maps.set(file, map)
        changed.set(file, map.text)
      }
    }
    if (changed.size) host.update(changed)
    return changed
  }

  /** The checker's errors, once per shadow text: conflicts, naming and reporting all want them. */
  diag(host, file) {
    const text = this.maps.get(file)?.text ?? this.texts.get(file)
    const hit = this.diags.get(file)
    if (hit?.text === text) return hit.list
    const list = host.diagnostics(file)
    this.diags.set(file, { text, list })
    return list
  }

  ask(host, file, reqs) {
    if (!reqs.length) return []
    this.stats.queries += reqs.length
    const map = this.maps.get(file)
    const at = (p) => (map ? toShadow(map, p) : p)
    return host.query(
      file,
      reqs.map((r) => ({ kind: r.kind, start: at(r.span[0]), end: at(r.span[1]) })),
    )
  }

  /** Who a tag renders when its name doesn't say: a component held in a variable, a map, a prop, an import. */
  flows(host, force) {
    const out = new Map() // "file:start" → comps
    const comps = this.comps()
    const open = comps.filter(
      (c) =>
        c.exported ||
        this.facts.get(c.file).escaped.has(c.name) ||
        [...this.facts.values()].some((f) => [...f.wraps.values()].some((l) => l.includes(c.name))),
    )
    if (!open.length) return out
    const names = new Set(open.map((c) => c.name))
    for (const [file, facts] of this.facts) {
      const cross = (s) => {
        const head = s.tag.split('.')[0]
        const imported = facts.imports.get(head)
        if (imported)
          return names.has(imported.name) || imported.name === 'default' || names.has(head)
        return !facts.comps.some((c) => c.name === s.tag)
      }
      const held = this.flowCache.get(file)
      if (force && !force.has(file) && held?.facts === facts) {
        for (const [k, v] of held.hits) out.set(k, v)
        continue
      }
      const sites = facts.sites.filter((s) => !this.direct(facts, s).length && cross(s))
      const hits = new Map()
      this.flowCache.set(file, { facts, hits })
      if (!sites.length) continue
      const res = this.ask(
        host,
        file,
        sites.map((s) => ({ kind: 'decls', span: s.tagSpan })),
      )
      sites.forEach((s, i) => {
        const found = []
        for (const d of res[i].decls ?? []) {
          for (const c of open) {
            if (!sameFile(c.file, d.file)) continue
            const map = this.maps.get(c.file)
            if (
              (map ? toShadow(map, c.bodySpan[1]) : c.bodySpan[1]) === d.end &&
              !found.includes(c)
            )
              found.push(c)
          }
        }
        if (found.length) {
          hits.set(`${file}:${s.span[0]}`, found)
          out.set(`${file}:${s.span[0]}`, found)
        }
      })
    }
    return out
  }

  /** Every call site of every component, with what the checker says each attribute is. */
  collect(host, force) {
    const flows = this.flows(host, force)
    const sites = new Map(this.comps().map((c) => [c.id, []]))
    for (const [file, facts] of this.facts) {
      const targets = facts.sites.map((s) => {
        const d = this.direct(facts, s)
        return d.length ? d : (flows.get(`${file}:${s.span[0]}`) ?? [])
      })
      let held = this.typed.get(file)
      if (!held || held.facts !== facts || !force || force.has(file)) {
        const reqs = [],
          back = []
        facts.sites.forEach((s, i) => {
          if (!targets[i].length) return
          for (const a of s.attrs)
            if (a.span) {
              back.push(a)
              reqs.push({ kind: 'type', span: a.span })
            }
          for (const sp of s.spreads) {
            back.push(sp)
            reqs.push({ kind: 'spread', span: sp.span })
          }
          if (s.children?.span) {
            back.push(s.children)
            reqs.push({ kind: 'type', span: s.children.span })
          }
        })
        const res = this.ask(host, file, reqs)
        held = { facts, typed: new Map(back.map((a, i) => [a, res[i]])) }
        this.typed.set(file, held)
      }
      const { typed } = held
      facts.sites.forEach((s, i) => {
        for (const c of targets[i]) sites.get(c.id).push({ file, site: s, typed })
      })
    }
    return sites
  }

  /** What the body alone says about `key`: what's left when no caller says, or a caller says `any`. */
  fromBody(c, key, entry, cache) {
    const q = (kind) => (span) => cache(kind, span)
    const typeOf = q('type'),
      ctx = q('context')
    let member = null
    for (const u of entry.uses) {
      if (u.as === 'number') return 'number'
      if (u.as === 'call')
        return `(${u.args.map((a, i) => `arg${i}: ${typeOf(a).text}`).join(', ')}) => any`
      if (u.as === 'context') {
        const t = ctx(u.span)
        if (t && !t.any && t.text !== 'unknown') return t.text.replace(/ \| undefined$/, '')
      }
      if (u.as === 'write') {
        const t = typeOf(u.value)
        if (!t.any) return t.text
      }
      if (u.as === 'member') member = u.member
    }
    if (member)
      return /^(length|map|filter|forEach|slice|find|some|every|join|reduce)$/.test(member)
        ? 'any[]'
        : `{ ${member}: any }`
    if (entry.fallback) {
      const t = typeOf(entry.fallback)
      if (!t.any) return t.text
    }
    return null
  }

  infer(c, sites, host) {
    const facts = this.facts.get(c.file)
    const prev = this.state.get(c.id) ?? {}
    const st = {
      keys: new Map(),
      sites: sites.length,
      pins: prev.pins ?? new Map(),
      shape: prev.shape,
      anyFrom: [],
      noCallers: false,
    }
    if (this.routes(c.file) && c.isDefault) {
      st.type = `import('@weft-js/start').RouteProps${facts.exportsLoad ? '<typeof load>' : ''}`
      st.route = true
      return st
    }
    const outer = sites.filter((s) => !(s.site.in === c.name && s.file === c.file))
    if (!outer.length) st.noCallers = true

    const memo = new Map()
    const cache = (kind, span) => {
      const k = `${kind}:${span}`
      if (!memo.has(k)) memo.set(k, this.ask(host, c.file, [{ kind, span }])[0])
      return memo.get(k)
    }

    const seen = new Map() // key → [{ text, exact, any, untypedFn, at }]
    const add = (key, v) => {
      if (!seen.has(key)) seen.set(key, [])
      seen.get(key).push(v)
    }
    for (const { file, site, typed } of sites) {
      const self = site.in === c.name && file === c.file
      for (const a of site.attrs) {
        const r = a.span ? typed.get(a) : null
        const held = a.value && this.facts.get(file).comps.some((x) => x.name === a.value)
        const v = held
          ? { text: `typeof ${a.value}` }
          : a.literal === 'true'
            ? { text: 'boolean' }
            : a.literal === 'string'
              ? { text: 'string', exact: a.exact }
              : (r ?? { text: 'any', any: true })
        if (self) continue // a component rendering itself says nothing new about its props
        add(a.name, {
          ...v,
          untypedFn: a.untypedFn,
          at: {
            file,
            span: a.span ?? a.whole ?? site.tagSpan,
            whole: a.whole ?? site.tagSpan,
            tag: site.tag,
            tagAt: site.tagSpan[0],
          },
          self,
          literal: a.literal,
        })
      }
      for (const sp of site.spreads) {
        const r = typed.get(sp)
        if (!self)
          for (const p of r?.props ?? [])
            add(p.name, {
              text: p.text,
              any: p.any,
              at: { file, span: sp.span, tag: site.tag },
              self,
              optional: p.optional,
            })
      }
      if (site.children && !self) {
        const r = site.children.span ? typed.get(site.children) : null
        add('children', {
          ...(r ?? { text: 'unknown' }),
          untypedFn: site.children.untypedFn,
          at: { file, span: site.tagSpan, tag: site.tag },
          self,
        })
      }
    }

    const fwd = c.forwards
    const named = new Set(c.info.keys.keys())
    const all = fwd.length ? named : new Set([...seen.keys(), ...named])
    const parts = []
    for (const key of all) {
      const entry = c.info.keys.get(key) ?? { uses: [] }
      const given = seen.get(key) ?? []
      const real = given.filter((v) => !v.any)
      const body =
        given.every((v) => v.any || v.untypedFn) || !given.length
          ? this.fromBody(c, key, entry, cache)
          : null
      let text
      const lits = real.filter((v) => v.exact?.startsWith('"'))
      if (
        real.length &&
        lits.length === real.length &&
        unique(lits.map((v) => v.exact)).length > 1 &&
        unique(lits.map((v) => v.exact)).length <= MAX_LITERALS
      )
        text = union(lits.map((v) => v.exact))
      else text = body ?? union(real.map((v) => v.text))
      const distinct = unique(real.map((v) => v.text))
      const tally = new Map(distinct.map((t) => [t, real.filter((v) => v.text === t).length]))
      const number =
        entry.uses.some((u) => u.as === 'number') && !tally.has('number') && distinct.length
          ? 'number'
          : null
      if (number) tally.set(number, 0)
      if (st.pins.has(key)) text = st.pins.get(key)
      else if (number) text = union([text, number])
      if (given.some((v) => v.any) && !real.length)
        st.anyFrom.push(...given.filter((v) => v.any).map((v) => ({ key, ...v.at, body: !!body })))
      if (!text) {
        if (given.length) text = 'any'
        else if (entry.fallback) text = 'any'
        else if (outer.length) text = 'undefined'
        else text = 'any'
      }
      const passed = outer.filter(
        (s) =>
          s.site.attrs.some((a) => a.name === key) ||
          (key === 'children' && s.site.children) ||
          s.site.spreads.some((sp) =>
            s.typed.get(sp)?.props?.some((p) => p.name === key && !p.optional),
          ),
      )
      const opaque = outer.some((s) => s.site.spreads.some((sp) => s.typed.get(sp)?.any))
      const required =
        outer.length &&
        passed.length === outer.length &&
        !entry.fallback &&
        !opaque &&
        text !== 'undefined'
      const onlySelf = !outer.length
      const optional = onlySelf ? !!entry.fallback : !required
      st.keys.set(key, { text, optional, given, tally, uses: entry.uses })
      parts.push(`${quote(key)}${optional ? '?' : ''}: ${text}`)
    }
    const own = parts.length ? `{ ${parts.join('; ')} }` : '{}'
    if (fwd.length) {
      const f = fwd[0]
      const base = `Parameters<typeof ${f.tag}>[0]`
      const names = unique([...named, ...f.given])
      const taken = names.map((n) => JSON.stringify(n)).join(' | ')
      const left = names.length ? `Omit<${base}, ${taken}>` : base
      const loose = f.given.filter((n) => !named.has(n))
      const given = loose.length
        ? ` & Partial<Pick<${base}, Extract<keyof ${base}, ${loose.map((n) => JSON.stringify(n)).join(' | ')}>>>`
        : ''
      st.type = parts.length ? `${left}${given} & ${own}` : `${left}${given}`
    } else st.type = c.info.opaque ? 'any' : (st.shape ?? own)
    return st
  }

  /** The body can't take the union: try each caller's type alone, and leave the rest as errors at those callers. */
  conflicts(host, comps) {
    for (const c of comps) {
      const st = this.state.get(c.id)
      if (!st?.keys) continue
      for (const [key, k] of st.keys) {
        if (k.tally.size < 2 || st.pins.has(key)) continue
        const map = this.maps.get(c.file)
        const uses = k.uses.map((u) => u.span.map((p) => toShadow(map, p)))
        const hurt = () =>
          this.diag(host, c.file).filter((d) =>
            uses.some((u) => overlaps(u, [d.start, d.start + d.length])),
          )
        if (!hurt().length) continue
        const shape = this.shapes(st)
        if (shape) {
          st.shape = shape
          this.state.set(c.id, this.infer(c, this.lastSites.get(c.id), host))
          this.publish(host, new Set([c.file]))
          const m2 = this.maps.get(c.file)
          const u2 = k.uses.map((u) => u.span.map((p) => toShadow(m2, p)))
          if (
            !this.diag(host, c.file).some((d) =>
              u2.some((u) => overlaps(u, [d.start, d.start + d.length])),
            )
          ) {
            st.shape = shape
            break
          }
          st.shape = undefined
          this.state.set(c.id, this.infer(c, this.lastSites.get(c.id), host))
          this.publish(host, new Set([c.file]))
        }
        const order = [...k.tally].sort((a, b) => b[1] - a[1]).map(([t]) => t)
        let chosen = null
        for (const t of order) {
          st.pins.set(key, t)
          this.state.set(c.id, this.infer(c, this.lastSites.get(c.id), host))
          this.publish(host, new Set([c.file]))
          const m2 = this.maps.get(c.file)
          const u2 = k.uses.map((u) => u.span.map((p) => toShadow(m2, p)))
          if (
            !this.diag(host, c.file).some((d) =>
              u2.some((u) => overlaps(u, [d.start, d.start + d.length])),
            )
          ) {
            chosen = t
            break
          }
        }
        if (chosen) {
          st.pins.set(key, chosen)
          const next = this.infer(c, this.lastSites.get(c.id), host)
          this.state.set(c.id, next)
          this.publish(host, new Set([c.file]))
          next.odd = [
            ...(next.odd ?? []),
            ...k.given
              .filter((v) => !v.any && v.text !== chosen)
              .map((v) => ({
                key,
                type: v.text,
                want: chosen,
                ...v.at,
                use: k.uses.find((u) => u.as !== 'read') ?? k.uses[0],
              })),
          ]
        } else {
          st.pins.delete(key)
          this.state.set(c.id, this.infer(c, this.lastSites.get(c.id), host))
          this.publish(host, new Set([c.file]))
        }
      }
    }
  }

  /** Callers that differ by a string prop: one object type per value, so the body can narrow on it. */
  shapes(st) {
    const keys = [...st.keys]
    const tag = keys.find(([, k]) => {
      const lits = k.given.map((v) => v.exact)
      return lits.length && lits.every((l) => l?.startsWith('"')) && new Set(lits).size > 1
    })
    if (!tag) return null
    const groups = new Map()
    for (const v of tag[1].given) {
      if (!groups.has(v.exact)) groups.set(v.exact, new Set())
      groups.get(v.exact).add(`${v.at.file}:${v.at.whole?.[0]}`)
    }
    return [...groups]
      .map(([lit]) => {
        const parts = [`${quote(tag[0])}: ${lit}`]
        for (const [key, k] of keys) {
          if (key === tag[0]) continue
          const near = tag[1].given.filter((v) => v.exact === lit).map((v) => v.at)
          const mine = k.given.filter((v) =>
            near.some((n) => n.tagAt === v.at.tagAt && n.file === v.at.file),
          )
          if (mine.length)
            parts.push(
              `${quote(key)}${mine.length < near.length ? '?' : ''}: ${union(mine.map((v) => v.text))}`,
            )
        }
        return `{ ${parts.join('; ')} }`
      })
      .join(' | ')
  }

  /** A type the checker printed in another scope may not be nameable here: then this component is `any`, and says so. */
  unprintable(host, comps) {
    for (const c of comps) {
      const map = this.maps.get(c.file)
      if (!map || !this.state.get(c.id)?.keys) continue
      for (const d of this.diag(host, c.file)) {
        const at = toSource(map, d.start)
        if (!inGenerated(map, d.start, d.length) || at !== c.nameEnd) continue
        const st = this.state.get(c.id)
        st.unnamed = d.text
        st.type = 'any'
      }
    }
  }

  /** The checker's errors in a file, in source positions, without what the engine already said better. */
  errors(host, file) {
    const map = this.maps.get(file)
    const said = (this.findings.get(file) ?? []).filter((f) => f.code === 'W084')
    return this.diag(host, file).flatMap((d) => {
      if (map && inGenerated(map, d.start, d.length)) return []
      const start = map ? toSource(map, d.start) : d.start
      const end = map ? toSource(map, d.start + d.length) : d.start + d.length
      if (said.some((f) => overlaps([f.start, f.end], [start, Math.max(end, start + 1)]))) return []
      return [{ code: `TS${d.code}`, start, end, why: d.text, help: 'Fix the type error' }]
    })
  }

  /** Files whose types depend on inference: where a component is, and where it's rendered. */
  affected() {
    const files = new Set(this.maps.keys())
    for (const sites of this.lastSites?.values() ?? []) for (const s of sites) files.add(s.file)
    return files
  }

  /** @returns {Map<string, {code: string, severity?: string, start: number, end: number, why: string, help?: string, edit?: object}[]>} */
  run(host, changed) {
    this.findings = new Map()
    const comps = this.comps()
    if (!this.needed()) {
      this.publish(host)
      return this.findings
    }
    const first = this.publish(host)
    let force = changed ? new Set(changed) : undefined
    if (force) {
      for (const f of changed) for (const d of this.dependents(f)) force.add(d)
      for (const f of first.keys()) force.add(f)
    }
    const touched = new Set(force)
    const sitesOf = (id) => (this.lastSites?.get(id) ?? []).map((s) => s.file)
    let dirty = comps
    for (let round = 0; round < ROUNDS; round++) {
      this.stats.rounds++
      const sites = this.collect(host, force)
      this.lastSites = sites
      if (force)
        dirty = comps.filter(
          (c) =>
            !this.state.has(c.id) ||
            force.has(c.file) ||
            sites.get(c.id).some((s) => force.has(s.file)),
        )
      const moved = []
      for (const c of dirty) {
        const st = this.infer(c, sites.get(c.id), host)
        if (st.type !== this.state.get(c.id)?.type) moved.push(c)
        this.state.set(c.id, st)
      }
      if (!moved.length) break
      const out = this.publish(host)
      force = new Set([...out.keys(), ...moved.flatMap((c) => [c.file, ...sitesOf(c.id)])])
      for (const f of force) touched.add(f)
    }
    this.conflicts(host, dirty)
    this.unprintable(host, dirty)
    this.publish(host)
    for (const c of comps) this.report(c)
    this.touched = touched
    return this.findings
  }

  note(file, finding) {
    if (!this.findings.has(file)) this.findings.set(file, [])
    this.findings.get(file).push(finding)
  }

  /** The source edits that write a type down. */
  annotation(c, type) {
    const text = `: ${MARK} ${type}`
    if (c.written) return [{ start: c.written[0], end: c.written[1], text }]
    if (c.parens) return [{ start: c.nameEnd, end: c.nameEnd, text }]
    return [
      { start: c.paramSpan[0], end: c.paramSpan[0], text: '(' },
      { start: c.nameEnd, end: c.nameEnd, text: `${text})` },
    ]
  }

  report(c) {
    const st = this.state.get(c.id)
    if (!st || st.route) return
    const [start, end] = c.nameSpan
    const line = (file, pos) => this.texts.get(file).slice(0, pos).split('\n').length
    if (st.unnamed)
      this.note(c.file, {
        code: 'W085',
        severity: 'warning',
        start,
        end,
        why: `\`${c.name}\`'s inferred props name a type this scope can't see, so they fell back to \`any\`: ${st.unnamed}`,
        help: 'Move the type to module scope or export it, or annotate the parameter',
      })
    const exposed = c.exported
    if (st.noCallers && !exposed) {
      const escaped = this.facts.get(c.file).escaped.has(c.name)
      this.note(
        c.file,
        escaped
          ? {
              code: 'W083',
              severity: 'warning',
              start,
              end,
              why: `\`${c.name}\` is used as a value and no JSX site for it could be traced, so its props are \`any\``,
              help: `Annotate its parameter: function ${c.name}(props: { ... })`,
            }
          : {
              code: 'W080',
              start,
              end,
              why: `\`${c.name}\` has an untyped parameter and nothing renders it, so its props have nothing to be inferred from`,
              help: `Render it (\`<${c.name} ... />\`), delete it, or annotate the parameter: function ${c.name}(props: { ... })`,
            },
      )
    }
    if (exposed) {
      const type = st.type
      const edits = this.annotation(c, type)
      const bad = st.noCallers
      if (!c.written)
        this.note(c.file, {
          code: 'W081',
          start,
          end,
          why: `\`${c.name}\` is exported with no prop type${bad ? ' and no caller to infer one from' : ''}. An export's type is written down, so a caller's edit can't change a public API unseen`,
          help: `\`weft fix\` writes the inferred type: ${c.name}(props: ${type})`,
          edits: bad ? undefined : edits,
          safe: !bad,
        })
      else if (c.writtenType.replace(MARK, '').trim() !== type && !bad)
        this.note(c.file, {
          code: 'W082',
          start,
          end,
          why: `\`${c.name}\`'s written prop type no longer matches its callers: it says ${c.writtenType.replace(MARK, '').trim()}, they need ${type}`,
          help: '`weft fix` rewrites it (a diff to review), or delete the /*inferred*/ comment to keep the type you have',
          edits,
          safe: true,
        })
    }
    for (const a of st.anyFrom) {
      const origin = this.origin(a.file, a.span)
      this.note(c.file, {
        code: 'W083',
        severity: 'warning',
        start,
        end,
        why: `\`${c.name}\`'s prop \`${a.key}\` is ${a.body ? 'typed from its use in the body, because' : '`any`, because'} the value at ${a.tag} (line ${line(a.file, a.span[0])}) is \`any\`${origin ? `: it comes from ${origin}` : ''}`,
        help: 'Give that source a type, or annotate the prop',
      })
    }
    for (const o of st.odd ?? []) {
      const use = o.use?.span ? this.texts.get(c.file).slice(...o.use.span) : o.key
      this.note(o.file, {
        code: 'W084',
        start: o.whole[0],
        end: o.whole[1],
        why: `\`${o.key}\` here is ${o.type}, but \`${c.name}\` uses it as ${o.want} (\`${use}\`, line ${line(c.file, o.use?.span?.[0] ?? c.nameSpan[0])}), and its other callers agree`,
        help: `Pass ${o.want} here, or change \`${c.name}\` to handle ${o.type} (a type parameter, if the two props must agree)`,
      })
    }
  }

  /** Where an `any` started, by following names in the file: `JSON.parse(raw)`, an untyped parameter, an import. */
  origin(file, span) {
    const ts = this.ts
    const text = this.texts.get(file)
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
    let node = null
    const find = (n) => {
      if (n.getStart(sf) <= span[0] && n.end >= span[1]) {
        node = n
        ts.forEachChild(n, find)
      }
    }
    ts.forEachChild(sf, find)
    for (let i = 0; node && i < 6; i++) {
      if (ts.isPropertyAccessExpression(node)) node = node.expression
      if (
        ts.isAsExpression(node) ||
        ts.isParenthesizedExpression(node) ||
        ts.isNonNullExpression(node)
      ) {
        node = node.expression
        continue
      }
      if (ts.isCallExpression(node))
        return `\`${node.getText(sf).slice(0, 48)}\` (line ${lineOf(node)})`
      if (!ts.isIdentifier(node))
        return `\`${node.getText(sf).slice(0, 48)}\` (line ${lineOf(node)})`
      let decl = null
      const look = (n) => {
        if (
          (ts.isVariableDeclaration(n) ||
            ts.isParameter(n) ||
            ts.isImportSpecifier(n) ||
            ts.isImportClause(n)) &&
          n.name?.getText(sf) === node.text &&
          n.pos < node.pos
        )
          decl = n
        ts.forEachChild(n, look)
      }
      ts.forEachChild(sf, look)
      if (!decl) return `\`${node.text}\``
      if (ts.isParameter(decl))
        return `the parameter \`${node.text}\`, which has no type (line ${lineOf(decl)})`
      if (ts.isImportSpecifier(decl) || ts.isImportClause(decl))
        return `\`${node.text}\`, imported at line ${lineOf(decl)}`
      if (!decl.initializer) return `\`${node.text}\` (line ${lineOf(decl)})`
      node = decl.initializer
    }
    return null
  }
}

module.exports = { Engine }
