// Three sections over one pinned canvas: each brings its own scene, and the next blends in as its section arrives.
import { render } from '@weft-js/core/dom'
import { clock } from '@weft-js/core/surface'
import { keelGovernor } from '@weft-js/plugin-keel/governor'
import { Scene, Stage, type ActiveScene } from '@weft-js/warp/scenes'
import { blocks, built, orrery, rings } from './scenes'
import './stage.css'

const governor = keelGovernor()
/** What the e2e test reads: where the page stands, and which scenes are built. */
const stageDemo = { active: null as ActiveScene | null, built, governor }

function StagePage() {
  return (
    <Stage
      label="Three generated scenes"
      governor={governor}
      onActive={(a) => (stageDemo.active = a)}
    >
      <Scene use={orrery} class="chapter" poster="#20242c" label="Orrery">
        <div class="panel">
          <h1>Orrery</h1>
          <p>Gold spheres round a dark one, lit by a studio that is generated, not loaded.</p>
        </div>
      </Scene>
      <Scene use={rings} class="chapter" poster="#173434" label="Rings">
        <div class="panel">
          <h2>Rings</h2>
          <p>
            Seven rings on one axis. The stage built this scene while the one above was showing.
          </p>
        </div>
      </Scene>
      <Scene use={blocks} class="chapter" poster="#2a2018" label="Blocks">
        <div class="panel">
          <h2>Blocks</h2>
          <p>Eighty-one blocks in one instanced draw. The first scene is freed by now.</p>
        </div>
      </Scene>
    </Stage>
  )
}

render(() => <StagePage />, document.getElementById('app')!)
Object.assign(window, { clock, stageDemo })
