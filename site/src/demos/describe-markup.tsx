import { Card } from '@weft-js/warp'

// The HTML this started as, made into TSX: one root,
// every tag closed, attributes as JSX.
export default function TodoList() {
  return (
    <Card title="Hedy Lamarr's todos">
      <ul class="todos">
        <li>Invent new traffic lights</li>
        <li>Rehearse a movie scene</li>
        <li>Improve the spectrum technology</li>
      </ul>
      <label for="note">A note</label>
      <br />
      <input
        id="note"
        placeholder="Anything else?"
      />
      <p
        className="hint"
        aria-live="polite"
        data-kind="hint"
      >
        Both class and className work; this paragraph uses
        className.
      </p>
    </Card>
  )
}
