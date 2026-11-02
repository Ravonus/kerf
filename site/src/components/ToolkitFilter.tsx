import { Chip, Search } from '@weft/warp'
import { state } from 'weft'

/** Filters the tiles the page already has: it only sets attributes, so a keystroke costs what a style change costs. */
export function ToolkitFilter(props: { groups: { id: string; title: string; count: number }[] }) {
  const on = state<string | null>(null)
  const count = state<number | null>(null)
  let query = ''
  const run = () => {
    const q = query.trim().toLowerCase()
    let shown = 0
    for (const g of document.querySelectorAll<HTMLElement>('[data-tk="group"]')) {
      let here = 0
      for (const t of g.querySelectorAll<HTMLElement>('[data-site="tile"]')) {
        const hit = (!q || (t.getAttribute('data-name') ?? '').includes(q) || t.textContent!.toLowerCase().includes(q)) && (!t.hasAttribute('data-rest') || !!q || on.value === g.id)
        t.hidden = !hit
        t.toggleAttribute('data-show', hit)
        if (hit) here++
      }
      g.hidden = !here || (on.value !== null && on.value !== g.id)
      if (!g.hidden) shown += here
    }
    count.value = q || on.value ? shown : null
  }
  const pick = (id: string) => { on.value = on.value === id ? null : id; run() }
  return (
    <div data-site="tk-filter">
      <Search label="Filter components" onInput={(e: Event) => { query = (e.target as HTMLInputElement).value; run() }} />
      <div data-part="chips">{props.groups.map(g => <Chip key={g.id} pressed={on.value === g.id} count={g.count} onClick={() => pick(g.id)}>{g.title}</Chip>)}</div>
      <p data-part="count" role="status">{count.value === null ? '' : `${count.value} ${count.value === 1 ? 'component' : 'components'}`}</p>
    </div>
  )
}
