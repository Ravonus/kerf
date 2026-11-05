import { OPAQUE, QUIET, STARTS, DATA, BOXES, SAFE, isServer } from './shared.mjs'

/** When an island may load: `when` (`v`, `i`, or none for the page's load), `why`, and `fix` when it's avoidable. */
export const timing = (n, s, local, rel) => {
  const seen = new Set()
  const at = (o) => `${o.name} (${rel(o.mod.file)}:${o.line})`
  const marks = {}
  let forced, stop
  const halt = (why, fix) => {
    stop ??= { why, fix }
  }
  const look = (owner, names) => lookAt(owner, names, { local, at, halt, visit, marks })
  const site = (owner, x) => {
    look(
      owner,
      x.attrs.flatMap((a) => a.uses),
    )
    look(owner, x.kids.uses)
    if (x.tag) look(owner, [x.tag])
  }
  /** The island's own site and the ones hoisted with it: `$iN` runs them, and a tag isn't among `kids.uses`. */
  const nested = (owner, x) => {
    site(owner, x)
    for (const i of x.kids.sites)
      site(
        owner,
        owner.sites.find((o) => o.index === i),
      )
  }
  const visit = (o) => {
    if (seen.has(o)) return
    seen.add(o)
    if (o.force === 'visible') return void (forced = o)
    if (o.force === 'static' || o.force === 'interaction') return
    if (o.force === 'client') return halt(`\`@weft client\` on ${at(o)}`)
    if (o.early)
      halt(
        `${o.early} in ${at(o)}`,
        o.early.startsWith('`autofocus')
          ? undefined
          : `keep the \`ref\` to storing the node, and do the work in a handler`,
      )
    if (o.mod.facts.effects)
      halt(
        `${rel(o.mod.file)} runs ${o.mod.facts.effects} as it loads`,
        `move that into a function an island calls`,
      )
    look(o, o.uses)
    for (const x of o.sites) site(o, x)
  }
  nested(n, s)
  if (stop) return stop
  const away = [...seen]
    .flatMap((o) => (o.force === 'interaction' ? [] : o.globals))
    .filter((g) => !SAFE.has(g))
  if (marks.start && away.length)
    return {
      why: `${marks.start} can reach \`${away[0]}\`, past the island`,
      fix: `\`/* @weft visible */\` above the component, when that only matters once it's on screen`,
    }
  if (forced) return { when: 'v', why: `\`@weft visible\` on ${at(forced)}` }
  if (marks.start) return { when: 'v', why: `${marks.start} stays inside the island` }
  if (marks.data) return { when: 'v', why: `${marks.data} reads server data` }
  return { when: 'i', why: 'handlers only: nothing happens before an event' }
}

function lookAt(owner, names, { local, at, halt, visit, marks }) {
  for (const u of names) {
    const i = owner.mod.imports.get(u)
    if (i && OPAQUE.test(i.source)) {
      if (i.source === '@weft-js/core' && STARTS.has(i.imported))
        marks.start ??= `\`${i.imported}\` in ${at(owner)}`
      else if (i.source === '@weft-js/core' && DATA.has(i.imported))
        marks.data ??= `\`${i.imported}\` in ${at(owner)}`
      else if (i.source === '@weft-js/core' && BOXES.has(i.imported)) {
        if (owner.value)
          halt(
            `\`${owner.name}\` is a box at module level (${at(owner)}): a write from outside couldn't reach an island that isn't running`,
            `make the box inside the component, or pass it down from one that runs: nothing else keeps this island from waiting`,
          )
      } else if (i.source === '@weft-js/core/media' && i.imported === 'Media')
        marks.start ??= `\`Media\` in ${at(owner)}` // a video's motion, a swap for a better copy
      else if (!QUIET[i.source]?.has(i.imported))
        halt(
          `\`${i.imported}\` from ${i.source} in ${at(owner)} isn't known to wait`,
          `\`/* @weft visible */\` above ${owner.name}, when it does nothing until it's on screen`,
        )
      continue
    }
    const file = i && owner.mod.resolved.get(i.source)
    if (file && isServer(file)) {
      if (owner.calls.includes(u)) marks.data ??= `\`${u}()\` in ${at(owner)}`
      continue
    }
    const t = local(owner.mod, u, new Set())
    if (t?.ns) t.ns.facts.nodes.forEach(visit)
    else if (t === true)
      halt(
        `\`${u}\` in ${at(owner)} is code the compiler can't see into`,
        `\`/* @weft visible */\` above ${owner.name}, when it does nothing until it's on screen`,
      )
    else if (t) visit(t)
  }
}
