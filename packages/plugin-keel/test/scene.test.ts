// The scene contract without a GPU: a stand-in renderer and scene graph record what the contract does to them.
import { describe, expect, it, vi } from 'vitest'
import { defineScene, type Levers, type SceneHost } from '../src/scene'

const LEVERS: Levers = {
  renderScale: 1,
  bloom: true,
  motes: 1,
  blendScale: 1,
  taa: true,
  density: 1,
}
const FRAME = { pointer: null, velocity: 0, time: 0 }

function node() {
  const children: unknown[] = []
  return {
    children,
    position: { x: 0, y: 0, z: 0, set: vi.fn() },
    fov: 30,
    lookAt: vi.fn(),
    rotateZ: vi.fn(),
    updateProjectionMatrix: vi.fn(),
    add: (...more: unknown[]) => children.push(...more),
    traverse(fn: (n: unknown) => void) {
      fn(this)
      for (const child of children) fn(child)
    },
  }
}

function host() {
  const renderer = { render: vi.fn() }
  return {
    renderer,
    host: { surface: { lit: {}, renderer }, seed: 3, quality: LEVERS } as never as SceneHost,
  }
}

describe('defineScene', () => {
  it('rides the camera on its tracks and hands the rest to `at`', async () => {
    const seen: unknown[] = []
    const camera = node()
    const scene = defineScene({
      tracks: [
        {
          target: 'camera',
          property: 'eye',
          keys: [
            [0, [0, 0, 10]],
            [2, [0, 2, 4]],
          ],
        },
        {
          target: 'ball',
          property: 'y',
          keys: [
            [0, 0],
            [2, 1],
          ],
        },
      ],
      build: ({ seed }) => ({ stage: node() as never, camera: camera as never, seed }),
      at(position, _frame, values) {
        seen.push([this.seed, position, values.ball?.y])
      },
    })
    const live = await scene.build(host().host)
    live.at(2, FRAME)
    expect(camera.position.set).toHaveBeenLastCalledWith(0, 2, 4)
    expect(seen).toEqual([[3, 2, 1]])
  })

  it('draws with the renderer, passes the levers on, and frees what it built', async () => {
    const geometry = { dispose: vi.fn() }
    const map = { isTexture: true, dispose: vi.fn() }
    const material = { map, dispose: vi.fn() }
    const stage = node()
    stage.add({ geometry, material })
    const setQuality = vi.fn()
    const scene = defineScene({
      build: () => ({ stage: stage as never, camera: node() as never }),
      setQuality,
    })
    const { host: h, renderer } = host()
    const live = await scene.build(h)
    live.render()
    expect(renderer.render).toHaveBeenCalledWith(stage, live.camera)
    live.setQuality({ ...LEVERS, density: 0.5 })
    expect(setQuality).toHaveBeenCalledWith({ ...LEVERS, density: 0.5 })
    live.dispose()
    expect(
      [geometry.dispose, material.dispose, map.dispose].map((f) => f.mock.calls.length),
    ).toEqual([1, 1, 1])
  })

  it('loads only the modules it names, once', async () => {
    const scene = defineScene({
      modules: ['tracks'],
      build: () => ({ stage: node(), camera: node() }) as never,
    })
    await Promise.all([scene.load(), scene.load()])
    const { host: h } = host()
    await expect(scene.build(h)).resolves.toHaveProperty('at')
  })
})
