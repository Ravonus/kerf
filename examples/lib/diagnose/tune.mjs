import { tuneGaps } from './gaps.mjs'
import { tuneLosses } from './losses.mjs'
import { PER, kb } from './units.mjs'

export function tuneFor(run, name, GAPS, gapAgainstBest) {
  const v = run.variants[name],
    items = new Map()
  // On a veneer variant, what costs size or hydration is veneer's to answer for until the split says otherwise.
  const kit = v.stack === 'kerf+veneer' ? 'veneer' : 'kerf'
  const add = (id, item) => {
    const was = items.get(id)
    if (!was || item.impact > was.impact)
      items.set(id, { ...item, pages: [...new Set([...(was?.pages ?? []), ...item.pages])] })
    else was.pages = [...new Set([...was.pages, ...item.pages])]
  }
  for (const [path, p] of Object.entries(v.pages)) {
    const split = v.split?.pages?.[path]?.groups ?? {}
    tuneLosses({ p, path, split, kit, add })
    tuneGaps({ run, name, path, p, split, kit, add, GAPS, gapAgainstBest })
    tuneFindings({ p, path, split, add })
  }
  return [...items.values()]
    .sort((a, b) => b.impact - a.impact)
    .map((i) => ({ ...i, variant: name, impact: +i.impact.toFixed(1) }))
}

function tuneFindings({ p, path, split, add }) {
  if (split.veneer)
    add('veneer-share', {
      where: 'veneer',
      title: 'veneer code in the first load',
      why: `${kb(split.veneer)} br of ${kb(p.metrics['bytes.js.br'].med)} on ${path}.`,
      impact: (split.veneer / 1024) * PER.kb,
      pages: [path],
    })
  for (const f of p.findings.slice(0, 6))
    if (!/font-display|cache/.test(f.id))
      add(`lh:${f.id}`, {
        where: 'kerf',
        title: f.title,
        why: `Lighthouse on ${path}${f.value ? `: ${f.value}` : ''}.`,
        impact: 0.2,
        pages: [path],
      })
}
