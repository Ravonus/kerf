// Three small scenes for the stage demo, each made from primitives in a few lines: a lit orrery under a studio
// environment, a stack of turning rings, and a field of rising blocks. The camera of each rides its own tracks.
import { defineScene, type SceneContext } from '@weft-js/plugin-keel/scene'

/** What the page and its tests read back: which scenes are built, and how many frames each has drawn. */
export const built = new Map<string, number>()

function room(ctx: SceneContext<never>, sky: string, ground: string) {
  const { lit } = ctx
  const stage = new lit.Stage()
  stage.background = new lit.Color(sky)
  const sun = new lit.SunLight('#fff4e0', 2.4)
  sun.position.set(4, 7, 5)
  stage.add(new lit.SkyLight('#ffffff', ground, 0.7), sun)
  const camera = new lit.PerspectiveCamera(40, 1, 0.1, 100)
  return { stage, camera }
}

function track(target: string, property: string, keys: [number, number | number[]][]) {
  return { target, property, keys }
}

/** Gold and pale spheres round a dark one, lit by a generated studio. */
export const orrery = defineScene({
  tracks: [
    track('camera', 'eye', [
      [0, [0, 1.5, 9]],
      [2, [2.5, 3, 6]],
    ]),
    track('camera', 'target', [[0, [0, 0, 0]]]),
    track('orbit', 'turn', [
      [0, 0],
      [3, Math.PI],
    ]),
  ],
  build(ctx) {
    const { lit } = ctx
    const { stage, camera } = room(ctx, '#20242c', '#3a3026')
    stage.environment = new lit.Environment(lit.STUDIO, { size: 64 })
    const orbit = new lit.Group()
    const metal = new lit.LitMaterial({ color: '#d9a93a', metalness: 1, roughness: 0.25 })
    for (let i = 0; i < 6; i++) {
      const ball = new lit.Mesh(lit.sphere(0.35, 32, 16), metal)
      ball.position.set(Math.cos(i) * 2.4, Math.sin(i * 2) * 0.4, Math.sin(i) * 2.4)
      orbit.add(ball)
    }
    const core = new lit.LitMaterial({ color: '#1b1d22', metalness: 0.2, roughness: 0.6 })
    orbit.add(new lit.Mesh(lit.sphere(1, 48, 24), core))
    stage.add(orbit)
    built.set('orrery', 0)
    return { stage, camera, orbit }
  },
  at(_position, _frame, values) {
    this.orbit.rotation.y = Number(values.orbit?.turn ?? 0)
    built.set('orrery', (built.get('orrery') ?? 0) + 1)
  },
  dispose: () => void built.delete('orrery'),
})

/** Rings stacked on one axis, each turning a little further than the one below it. */
export const rings = defineScene({
  tracks: [
    track('camera', 'eye', [
      [0, [0, 6, 7]],
      [2.5, [0, 1, 8]],
    ]),
    track('camera', 'target', [[0, [0, 1.2, 0]]]),
  ],
  build(ctx) {
    const { lit } = ctx
    const { stage, camera } = room(ctx, '#173434', '#203a30')
    const list = Array.from({ length: 7 }, (_, i) => {
      const paint = new lit.LitMaterial({ color: i % 2 ? '#e8e2d0' : '#2e8f86', roughness: 0.4 })
      const ring = new lit.Mesh(lit.torus(1.4 - i * 0.12, 0.08, 12, 64), paint)
      ring.position.set(0, i * 0.4, 0)
      stage.add(ring)
      return ring
    })
    built.set('rings', 0)
    return { stage, camera, list }
  },
  at(position, frame) {
    this.list.forEach((ring, i) =>
      ring.rotation.set(Math.PI / 2 + position * 0.3 * i, frame.time * 0.2, 0),
    )
    built.set('rings', (built.get('rings') ?? 0) + 1)
  },
  dispose: () => void built.delete('rings'),
})

/** A grid of blocks, drawn as one instanced mesh, rising row by row with the position. A torn panel crosses it. */
export const blocks = defineScene({
  tracks: [
    track('post', 'progress', [
      [0.9, 0],
      [1.5, 1],
      [2.1, 2],
    ]),
    track('post', 'tear', [[0, 1]]),
    track('post', 'darken', [
      [0.9, 0],
      [1.5, 0.35],
    ]),
    track('camera', 'eye', [
      [0, [9, 7, 9]],
      [3, [4, 2.5, 7]],
    ]),
    track('camera', 'target', [[0, [0, 0, 0]]]),
  ],
  build(ctx) {
    const { lit } = ctx
    const { stage, camera } = room(ctx, '#2a2018', '#40302a')
    const paint = new lit.LitMaterial({ color: '#c4673b', roughness: 0.7 })
    const grid = new lit.Instances(lit.box(0.8, 1, 0.8), paint, 81)
    stage.add(grid)
    built.set('blocks', 0)
    return { stage, camera, grid, lit }
  },
  at(position) {
    const { lit, grid } = this
    const at = new lit.Matrix4()
    for (let i = 0; i < 81; i++) {
      const row = Math.floor(i / 9)
      const rise = Math.max(0, Math.min(1, position * 1.5 - row * 0.12))
      grid.setMatrixAt(i, at.makeTranslation((i % 9) - 4, rise * 1.6 - 0.5, row - 4))
    }
    grid.instanceMatrix.needsUpdate = true
    built.set('blocks', (built.get('blocks') ?? 0) + 1)
  },
  dispose: () => void built.delete('blocks'),
})
