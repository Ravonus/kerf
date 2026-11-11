const { toShadow } = require('../shadow.cjs')
const { MAX_LITERALS, quote, unique, union, sameFile } = require('./utils.cjs')

function findFlows(host, force) {
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
          if ((map ? toShadow(map, c.bodySpan[1]) : c.bodySpan[1]) === d.end && !found.includes(c))
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

function collect(host, force) {
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

function fromBody(c, key, entry, cache) {
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

function siteValues(engine, c, sites) {
  const seen = new Map() // key → [{ text, exact, any, untypedFn, at }]
  const add = (key, v) => {
    if (!seen.has(key)) seen.set(key, [])
    seen.get(key).push(v)
  }
  for (const { file, site, typed } of sites) {
    const self = site.in === c.name && file === c.file
    for (const a of site.attrs) {
      const r = a.span ? typed.get(a) : null
      const held = a.value && engine.facts.get(file).comps.some((x) => x.name === a.value)
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

  return seen
}

function inferKeys({ engine, c, fwd, outer, st, seen, cache }) {
  const named = new Set(c.info.keys.keys())
  const all = fwd.length ? named : new Set([...seen.keys(), ...named])
  const parts = []
  for (const key of all) {
    const entry = c.info.keys.get(key) ?? { uses: [] }
    const given = seen.get(key) ?? []
    const real = given.filter((v) => !v.any)
    const body =
      given.every((v) => v.any || v.untypedFn) || !given.length
        ? engine.fromBody(c, key, entry, cache)
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
  return { named, parts }
}

function infer(c, sites, host) {
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
    st.type = `import('@kerf/start').RouteProps${facts.exportsLoad ? '<typeof load>' : ''}`
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

  const seen = siteValues(this, c, sites)

  const fwd = c.forwards
  const { named, parts } = inferKeys({ engine: this, c, fwd, outer, st, seen, cache })
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

module.exports = { flows: findFlows, collect, fromBody, infer }
