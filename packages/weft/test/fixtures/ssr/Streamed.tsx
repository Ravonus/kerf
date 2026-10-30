// Two Boundaries with resources that resolve at different times, for test/stream.test.tsx.
import { Boundary, resource } from 'weft'

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
