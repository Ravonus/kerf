import { Boundary, resource } from '@kerf/core'
import { later } from '../db'

function Read() {
  const r = resource(() => later(1500, 'awake'))
  return <p class="awake">{r.value}</p>
}

// Its own component, so the island is this Boundary and its first element is the fallback the chunk replaces. With no box,
// so that element is never seen, as a shape variant's wrapper isn't.
function Late() {
  return (
    <Boundary
      pending={
        <p class="wait-awake" style="display:none">
          Waiting
        </p>
      }
    >
      <Read />
    </Boundary>
  )
}

export default function HeldIsland() {
  return (
    <main>
      <Late />
    </main>
  )
}
