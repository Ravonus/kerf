import { Boundary, resource } from 'weft'
import type { RouteProps } from '@weft/start'
import { later } from '../db'
import './stream-sheet.css'

export const load = async () => ({ n: later(40, 7) })

function Count(props: { n: Promise<number> }) {
  const r = resource(() => props.n)
  return <section data-scope="late-card">{r.value}</section>
}

// The sheet is past the first-paint budget, so the head carries the shell's rules and the chunk needs the rest.
export default function StreamSheet(props: RouteProps<typeof load>) {
  return (
    <main data-scope="shell-card">
      <Boundary pending={<p class="skeleton">Loading</p>}>
        <Count n={props.data.n} />
      </Boundary>
    </main>
  )
}
