import { Link } from '@kerf-js/start'
import { ArtStage } from '../toolkit/art/stage'
import '../styles/art.css'

const PIECES = ['woven-word', 'bobbin', 'survey', 'tide-table', 'moire-loom', 'caustics']

/** The kit can draw, too: a few live pieces, and the way to the rest. */
export function ArtStrip() {
  return (
    <section data-site="art-strip">
      <h2 data-flow="heading">Veneer draws, too</h2>
      <p data-part="intro">
        Canvas art in your theme's own inks. These run on this page, three at most moving at a time.
      </p>
      <div data-part="wall">
        {PIECES.map((id) => (
          <div key={id} data-flow="image">
            <ArtStage id={id} />
          </div>
        ))}
      </div>
      <p data-part="more">
        <Link href="/art">See the gallery</Link>
      </p>
    </section>
  )
}
