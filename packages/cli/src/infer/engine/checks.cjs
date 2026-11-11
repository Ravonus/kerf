const { inGenerated, toShadow, toSource } = require('../shadow.cjs')
const { ROUNDS, quote, union, overlaps } = require('./utils.cjs')

function conflicts(host, comps) {
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

function shapes(st) {
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

function unprintable(host, comps) {
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

function errors(host, file) {
  const map = this.maps.get(file)
  const said = (this.findings.get(file) ?? []).filter((f) => f.code === 'W084')
  return this.diag(host, file).flatMap((d) => {
    if (map && inGenerated(map, d.start, d.length)) return []
    const start = map ? toSource(map, d.start) : d.start
    const end = map ? toSource(map, d.start + d.length) : d.start + d.length
    if (said.some((f) => overlaps([f.start, f.end], [start, Math.max(end, start + 1)]))) return []
    return [{ code: `TS${d.code}`, start, end, why: d.text, help: 'Fix the type error', ...d.kerf }]
  })
}

function affected() {
  const files = new Set(this.maps.keys())
  const derived = this.derivedWritesNeeded()
  if (derived || this.boxPropsNeeded())
    for (const facts of this.facts.values())
      if (derived || facts.sites.length) files.add(facts.file)
  for (const sites of this.lastSites?.values() ?? []) for (const s of sites) files.add(s.file)
  return files
}

function run(host, changed) {
  if (this.typedChecksNeeded()) this.diags.clear()
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

module.exports = { conflicts, shapes, unprintable, errors, affected, run }
