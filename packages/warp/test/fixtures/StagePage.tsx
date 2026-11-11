// A stage with two scenes that never build: what the server sends before any script runs.
import { Scene, Stage, type StageSceneDef } from '@weft-js/warp/scenes'

const idle: StageSceneDef = { build: () => new Promise(() => {}) }

export function StagePage() {
  return (
    <Stage label="Two scenes">
      <Scene use={idle} poster="#203040">
        <h2>First</h2>
      </Scene>
      <Scene use={idle} poster="/second.avif">
        <h2>Second</h2>
      </Scene>
    </Stage>
  )
}
