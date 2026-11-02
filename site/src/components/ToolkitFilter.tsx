import { Search } from '@weft/warp'
import { state } from 'weft'

/** Filters the tiles the page already has: it only sets attributes, so a keystroke costs what a style change costs. */
export function ToolkitFilter() {
  const count = state<number | null>(null)
  let query = ''
  const run = () => {
    const q = query.trim().toLowerCase()
    let shown = 0
    for (const g of document.querySelectorAll<HTMLElement>('[data-tk="group"]')) {
      let here = 0
      for (const t of g.querySelectorAll<HTMLElement>('[data-site="tile"]')) {
        const hit = (!q || (t.getAttribute('data-name') ?? '').includes(q) || t.textContent!.toLowerCase().includes(q))
        t.hidden = !hit
        t.toggleAttribute('data-show', hit)
        if (hit) here++
      }
      g.hidden = !here
      if (!g.hidden) shown += here
    }
    count.value = q ? shown : null
  }
  return (
    <div data-site="tk-filter">
      <Search label="Filter components" onInput={(e: Event) => { query = (e.target as HTMLInputElement).value; run() }} />
      <p data-part="count" role="status">{count.value === null ? '' : `${count.value} ${count.value === 1 ? 'component' : 'components'}`}</p>
    </div>
  )
}
