// Prop inference (research 44). Facts come from syntax; the types come from whichever checker the host wraps, asked
// about the call sites in the program's own terms. A round writes each component's annotation into its file's shadow;
// the next round sees the types that made possible (a prop forwarded to another inferred component, a component passed
// as a prop). Rounds stop when nothing changes. A checker starts for inference or box/value prop checks.

const { fileFacts, hashOf } = require('./facts.cjs')
const { shadow, toShadow } = require('./shadow.cjs')

const { flows, collect, fromBody, infer } = require('./engine/flow.cjs')
const { conflicts, shapes, unprintable, errors, affected, run } = require('./engine/checks.cjs')
const { note: noteFinding, annotation, report, origin } = require('./engine/report.cjs')

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
  /** Facts that need a checker: inferred props, bindings or possible box/value prop errors. */
  needed() {
    return (
      this.boxPropsNeeded() || [...this.facts.values()].some(
        (f) => f.comps.length || f.sites.some((s) => s.attrs.some((a) => a.bind)),
      )
    )
  }

  /** Syntax only gates startup; the checker proves every W008 finding. */
  boxPropsNeeded() {
    const sites = [...this.facts.values()].some((facts) =>
      facts.sites.some((site) => site.attrs.length),
    )
    return sites && [...this.texts.values()].some((text) => /['"]@weft-js\/core['"]/.test(text))
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
    if (this.boxPropsNeeded()) return true
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
    return flows.call(this, host, force)
  }

  /** Every call site of every component, with what the checker says each attribute is. */
  collect(host, force) {
    return collect.call(this, host, force)
  }

  /** What the body alone says about `key`: what's left when no caller says, or a caller says `any`. */
  fromBody(c, key, entry, cache) {
    return fromBody.call(this, c, key, entry, cache)
  }

  infer(c, sites, host) {
    return infer.call(this, c, sites, host)
  }

  /** The body can't take the union: try each caller's type alone, and leave the rest as errors at those callers. */
  conflicts(host, comps) {
    return conflicts.call(this, host, comps)
  }

  /** Callers that differ by a string prop: one object type per value, so the body can narrow on it. */
  shapes(st) {
    return shapes.call(this, st)
  }

  /** A type the checker printed in another scope may not be nameable here: then this component is `any`, and says so. */
  unprintable(host, comps) {
    return unprintable.call(this, host, comps)
  }

  /** The checker's errors in a file, in source positions, without what the engine already said better. */
  errors(host, file) {
    return errors.call(this, host, file)
  }

  /** Files whose types depend on inference: where a component is, and where it's rendered. */
  affected() {
    return affected.call(this)
  }

  /** @returns {Map<string, {code: string, severity?: string, start: number, end: number, why: string, help?: string, edit?: object}[]>} */
  run(host, changed) {
    return run.call(this, host, changed)
  }

  note(file, finding) {
    return noteFinding.call(this, file, finding)
  }

  /** The source edits that write a type down. */
  annotation(c, type) {
    return annotation.call(this, c, type)
  }

  report(c) {
    return report.call(this, c)
  }

  /** Where an `any` started, by following names in the file: `JSON.parse(raw)`, an untyped parameter, an import. */
  origin(file, span) {
    return origin.call(this, file, span)
  }
}

module.exports = { Engine }
