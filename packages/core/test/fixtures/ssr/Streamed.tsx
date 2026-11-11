// Two Boundaries with resources that resolve at different times, for test/stream.test.tsx.
import { Boundary, resource } from '@kerf-js/core'

function Part(props: { load: (what: string) => Promise<string>; what: string }) {
  const v = resource(() => props.load(props.what))
  return <p class="part">{v.value}</p>
}

export function Page(props: { load: (what: string) => Promise<string> }) {
  return (
    <main>
      <h1>Streamed</h1>
      <Boundary pending={<p class="skeleton">Loading fast</p>}>
        <Part load={props.load} what="fast" />
      </Boundary>
      <section>
        <Boundary pending={<p class="skeleton">Loading slow</p>}>
          <Part load={props.load} what="slow" />
        </Boundary>
      </section>
    </main>
  )
}

/** A resource outside any Boundary: nothing can stream it in, so `settle()` holds the shell for it. */
export function Bare(props: { load: (what: string) => Promise<string> }) {
  const v = resource(() => props.load('bare'))
  return <p class="bare">{v.value}</p>
}
