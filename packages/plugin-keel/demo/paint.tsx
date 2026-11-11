// Painted grounds as page media: two card backgrounds and a paper tile painted from seeded recipes at build time
// (`?paint`), and one card painted in the page for a colour chosen at run time (`paintLive`).
import { render } from '@weft-js/core/dom'
import { Media, type MediaAsset } from '@weft-js/core/media'
import { state } from '@weft-js/core'
import { cssImage, paintLive } from '@weft-js/plugin-keel/paint-live'
import cloth from './paint/cloth.paint.json?paint'
import floral from './paint/floral.paint.json?paint'
import paper from './paint/paper.paint.json?paint'
import './paint.css'

/** What the e2e test reads: the build's records, and the live one once it is painted. */
const paintDemo = { floral, cloth, paper, live: null as MediaAsset | null, liveMs: 0 }

function Card(props: { src: MediaAsset; label: string; id: string }) {
  return (
    <figure class="card" data-card={props.id}>
      <Media src={props.src} alt="" decorative width="554px" />
      <p>{props.label}</p>
    </figure>
  )
}

function PaintPage() {
  const live = state<MediaAsset | null>(null)
  // A themed variant can't be baked: it is painted here, once, from the same recipe with the theme's ground.
  const asked = performance.now()
  void paintLive({
    surface: 'painted-cloth',
    seed: 12,
    width: 1108,
    height: 700,
    with: { ground: '#3a2347', glaze: '#4a2f5a' },
  }).then((asset) => {
    paintDemo.live = asset
    paintDemo.liveMs = Math.round(performance.now() - asked)
    live.value = asset
  })
  return (
    <main class="band" style={`background-image:${cssImage(paper)}`}>
      <div class="cards">
        <Card src={floral} label="Painted at build: a floral ground" id="floral" />
        <Card src={cloth} label="Painted at build: folded cloth" id="cloth" />
        {() =>
          live.value ? (
            <Card src={live.value} label="Painted in the page, in the theme's colour" id="live" />
          ) : null
        }
      </div>
    </main>
  )
}

render(() => <PaintPage />, document.getElementById('app')!)
Object.assign(window, { paintDemo })
