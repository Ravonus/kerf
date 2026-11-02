import { Boundary, resource } from 'weft'
import type { RouteProps } from '@weft/start'
import { later } from '../db'
import './stream-sheet.css'

// `?x`: the shell reaches a rule an earlier render of the route didn't, after that render's head was kept.
export const load = async ({ request }: { request: Request }) => ({ n: later(40, 7), x: new URL(request.url).searchParams.has('x') })

function Count(props: { n: Promise<number> }) {
  const r = resource(() => props.n)
  return <section data-scope="late-card">{r.value}</section>
}

// The sheet is past the first-paint budget, so the head carries the shell's rules and the chunk needs the rest.
export default function StreamSheet(props: RouteProps<typeof load>) {
  // Read outside any Boundary, so the shell waits on it: a render slow enough for the head to go first.
  const shell = resource(() => later(10, 'ready'))
  return (
    <main data-scope="shell-card">
      {props.data.x && <p data-scope="extra-card">extra</p>}
      <p class="ready">{shell.value}</p>
      <Boundary pending={<p class="skeleton">Loading</p>}>
        <Count n={props.data.n} />
      </Boundary>
    </main>
  )
}
