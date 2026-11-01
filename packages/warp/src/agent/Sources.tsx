import type { AgentSource } from '@weft/ui-core'
import { derived } from 'weft'
import { Sweep, useSweep } from './bits'
import '../styles'
import '@weft/ui-core/styles/app/sources.css'

/** Sources (07 §1.1): numbered cards, the same numbers as the cites. `base` ties them to their Cite hrefs. */
export function Sources({ items, base }: { items: AgentSource[]; base: string }) {
  useSweep()
  const rows = derived(() => items.map((s, i) => ({ s, n: i + 1, id: `${base}-s${i + 1}` })))
  return (
    <div data-scope="sources" role="group" aria-label="Sources">
      {rows.value.map(r => (
        <a key={r.n} id={r.id} href={r.s.url ?? `#${r.id}`} data-sweep="">
          <Sweep />
          <i>{r.n}</i>
          <b>{r.s.title}</b>
          {r.s.path !== undefined && <small>{r.s.path}</small>}
        </a>
      ))}
    </div>
  )
}
