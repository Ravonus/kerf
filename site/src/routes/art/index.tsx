import { Link, type Meta } from '@kerf/start'
import { CodeBlock } from '@kerf/veneer'
import { ROOMS } from '../../toolkit/art'
import { ArtDial, ArtStage } from '../../toolkit/art/stage'
import '../../styles/art.css'
import '../../styles/docs.css'

export const prerender = true
export const meta: Meta = {
  title: 'Art',
  description:
    "Twenty-eight pieces drawn with Veneer's Canvas and dither fields, in Veneer's own inks. They follow the theme and the dial, and only three move at once.",
}

/** Two to a row, so a piece left without a partner, before a wide one or at the end, takes the row. */
const alone = (pieces: [string, { wide?: boolean }][], i: number) => {
  if (pieces[i + 1] && !pieces[i + 1]![1].wide) return false
  let run = 0
  for (let n = i; n >= 0 && !pieces[n]![1].wide; n--) run++
  return run % 2 === 1
}

export default function ArtGallery() {
  return (
    <article data-site="doc" data-art="gallery" data-expression="balanced">
      <header>
        <h1>Art</h1>
        <p data-part="lede">
          Twenty-eight pieces drawn with <Link href="/components/canvas">Canvas</Link> and{' '}
          <Link href="/components/dither-field">DitherField</Link>, in veneer's own inks. They follow
          your theme and the dial, three at most move at a time, and the rest wait as stills.
        </p>
      </header>
      <nav aria-label="On this page" data-art="jump">
        {ROOMS.map((r) => (
          <Link key={r.kind} href={`#${r.kind}`}>
            {r.title}
          </Link>
        ))}
      </nav>
      <div data-art="bar">
        <span>Each piece changes with the dial:</span>
        <ArtDial />
      </div>
      <div data-art="stages">
        {ROOMS.map((room) => (
          <section key={room.kind} id={room.kind} data-art="room">
            <h2 data-flow="heading">{room.title}</h2>
            <p>{room.intro}</p>
            <div data-art="wall">
              {room.pieces.map(([slug, piece], i) => (
                <section
                  key={slug}
                  id={slug}
                  data-art="piece"
                  data-flow="image"
                  data-wide={piece.wide || alone(room.pieces, i) ? '' : undefined}
                >
                  <ArtStage id={slug} />
                  <h3>{piece.name}</h3>
                  <p>{piece.description}</p>
                  <details>
                    <summary>Code</summary>
                    <CodeBlock code={piece.code} />
                  </details>
                </section>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  )
}
