// A stage with three scenes that never build: what the server sends before any script runs.
import { bakedPosters, Scene, Stage, type StageSceneDef } from '@weft-js/warp/scenes'

const idle: StageSceneDef = { build: () => new Promise(() => {}) }
const still = {
  kind: 'photo',
  src: '/third.avif',
  width: 16,
  height: 9,
  type: 'image/avif',
} as const
bakedPosters({ third: { desktop: { ...still, sources: [], name: 'third.avif' } } })

export function StagePage() {
  return (
    <Stage label="Three scenes">
      <Scene use={idle} poster="#203040">
        <h2>First</h2>
      </Scene>
      <Scene use={idle} poster="/second.avif">
        <h2>Second</h2>
      </Scene>
      <Scene id="third" use={idle} poster="bake">
        <h2>Third</h2>
      </Scene>
    </Stage>
  )
}
