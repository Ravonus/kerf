import { Away, Field, Held, Log, Named, Seen, Tap, Unfold } from '../components/lazy'

export default function Lazy() {
  return (
    <main class="lazy">
      <h1>Lazy</h1>
      <Tap id="one" />
      <Log />
      <Field />
      <Named />
      <Away />
      <Unfold>
        <p class="late">kept</p>
      </Unfold>
      <div style="height:3000px">spacer</div>
      <Tap id="far" />
      <Held n={3} />
      <Seen />
    </main>
  )
}
