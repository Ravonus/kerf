// The scene contract without a GPU: a stand-in renderer and scene graph record what the contract does to them.
import { describe, expect, it, vi } from 'vitest'
import { defineScene, type Levers, type SceneHost } from '../src/scene'

const LEVERS: Levers = {
  renderScale: 1,
  bloom: 1,
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
    aspect: 1,
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
    host: {
      surface: { lit: {}, renderer, size: { value: { width: 200, height: 100 } } },
      seed: 3,
      quality: LEVERS,
    } as never as SceneHost,
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
    expect(live.camera.aspect).toBe(2)
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

describe('defineScene for a blend', () => {
  it("feeds the section's pass from tracks on the `post` target", async () => {
    const scene = defineScene({
      tracks: [
        {
          target: 'post',
          property: 'progress',
          keys: [
            [0, 0],
            [2, 2],
          ],
        },
        { target: 'post', property: 'tear', keys: [[0, 1]] },
      ],
      build: () => ({ stage: node(), camera: node() }) as never,
    })
    const live = await scene.build(host().host)
    expect(live.post).toBeNull()
    live.at(1, FRAME)
    expect(live.post).toEqual({ progress: 1, tear: 1 })
  })

  it('gives a finish its stage and fitted camera, or its own draw when it renders itself', async () => {
    const stage = node()
    const plain = await defineScene({
      build: () => ({ stage: stage as never, camera: node() as never }),
    }).build(host().host)
    expect(plain.shot()).toEqual({ scene: stage, camera: plain.camera })
    expect(plain.camera.aspect).toBe(2)
    const own = vi.fn()
    const drawn = await defineScene({
      build: () => ({ stage: node(), camera: node() }) as never,
      render: own,
    }).build(host().host)
    const shot = drawn.shot()
    expect(typeof shot).toBe('function')
    ;(shot as () => void)()
    expect(own).toHaveBeenCalledOnce()
  })

  it("resolves its `hold` to a position: as given, or its tracks' first or last key", async () => {
    const tracks = [
      {
        target: 'ball',
        property: 'y',
        keys: [
          [0.5, 0],
          [2.5, 1],
        ],
      },
    ] as const
    const held = (hold?: number | 'first' | 'last') =>
      defineScene({
        tracks,
        ...(hold !== undefined && { hold }),
        build: () => ({ stage: node(), camera: node() }) as never,
      })
        .build(host().host)
        .then((live) => live.hold)
    expect(await held()).toBeUndefined()
    expect(await held(1.2)).toBe(1.2)
    expect(await held('first')).toBe(0.5)
    expect(await held('last')).toBe(2.5)
  })
})
