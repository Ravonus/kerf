// A pinned grove scrubbed by the scroll: the camera flies in while spring turns to autumn and morning to evening.
// Nothing here is an authored asset: every tree is grown from a seed, and the light is the sun's for the hour.
import { state } from '@kerf-js/core'
import { defineSurface, Surface } from '@kerf-js/core/surface'
import { keelStage, type KeelStage, type LookKind } from '@kerf-js/keel/stage'
import type { Band } from '@kerf-js/keel/modules/band'
import type * as Growth from '@kerf-js/keel/modules/tree-growth'
import type * as Render from '@kerf-js/keel/modules/tree-render'
import { progress, timeline } from '@kerf-js/scroll/timeline'

const SEED = 7
const SPECIES = ['oak', 'birch', 'pine', 'maple'] as const
// The grove's own tree colours (keel cherryblossom's TREE_TYPES).
const COLORS = {
  oak: {
    trunk: ['#4e3223', '#70462a', '#97623b'],
    leaves: ['#3e6b48', '#557f52', '#7d9c5e'],
    spring: ['#6eaa57', '#a6ce6f', '#cfe08c'],
    autumn: ['#ae5534', '#d9853d', '#ddb552'],
    leafScale: 0.26,
  },
  birch: {
    trunk: ['#e7dfcf', '#c8c5b8', '#7d7c73'],
    leaves: ['#7f9f53', '#b0bd5e', '#d1d16c'],
    spring: ['#93ba70', '#c5d78a', '#e2e8a1'],
    autumn: ['#d89a42', '#f1c259', '#f3dc8b'],
    leafScale: 0.22,
  },
  pine: {
    trunk: ['#483323', '#624029', '#825433'],
    leaves: ['#2f5530', '#47713a', '#6e9248'],
    spring: ['#4f8a45', '#79a85a', '#a3c473'],
    autumn: ['#4a6a38', '#6d8445', '#93985a'],
    leafScale: 0.24,
  },
  maple: {
    trunk: ['#4a382c', '#685040', '#8a6c54'],
    leaves: ['#4f8a3e', '#6aa64a', '#97c05c'],
    spring: ['#9cc46a', '#c3da84', '#e2ea9e'],
    autumn: ['#c42a1c', '#e8561e', '#f2a420'],
    leafScale: 0.27,
  },
}

/** The whole scene's motion, as data: every value at every scroll position. */
export const tracks = timeline({
  x: [
    [0, 0],
    [0.5, -7],
    [1, 5],
  ],
  y: [
    [0, 17],
    [0.45, 3.2],
    [1, 2.1],
  ],
  z: [
    [0, 54],
    [0.5, 21],
    [1, 8],
  ],
  lookY: [
    [0, 2],
    [1, 4.6],
  ],
  fov: [
    [0, 34],
    [1, 50],
  ],
  day: [
    [0, 118, 'linear'],
    [0.55, 205, 'linear'],
    [1, 296, 'linear'],
  ],
  hour: [
    [0, 8.5, 'linear'],
    [1, 16.2, 'linear'],
  ],
})

/** What the page and its tests read back: the scroll position, and what the forest is drawing. */
export const grove = {
  progress: 0,
  ready: false,
  look: 'realism' as LookKind,
  triangles: 0,
  stage: null as KeelStage | null,
  world: null as unknown,
  band: null as Band | null,
}

// The score: one seeded piece, with more of the band joining in as the scroll goes deeper into the grove.
let audio: AudioContext | undefined
const energyAt = (position: number) => 0.3 + 0.7 * position

/** Starts or fades out the music. Call it from a click: a browser only starts audio from a gesture. */
export async function setSound(on: boolean) {
  if (!on) {
    grove.band?.setGain(0, 0.4)
    const fading = grove.band
    setTimeout(() => fading?.stop(), 600)
    return
  }
  audio ??= new AudioContext()
  await audio.resume()
  const { createBand, scoreOf } = await import('@kerf-js/keel/modules/band')
  grove.band ??= createBand(audio, { gain: 0.6 })
  grove.band.setGain(0.6, 0.2)
  grove.band.start(scoreOf({ seed: 'grove', style: 'dream' }), energyAt(grove.progress))
}

type Scene = Parameters<typeof keelStage>[0]

function plant(stage: KeelStage, lit: Scene['lit'], growth: typeof Growth, render: typeof Render) {
  const ground = new lit.Mesh(
    lit.plane(260, 260),
    new lit.LitMaterial({ color: '#56703f', roughness: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  stage.scene.add(ground)

  const variants = SPECIES.flatMap((species, index) =>
    [0, 1].map((copy) => {
      const model = growth.growTree({
        species,
        seed: SEED * 7919 + index * 977 + copy * 131,
        maxNodes: 1100,
      })
      const frame = growth.treeFrame(model, model.cycles * (0.8 + copy * 0.12), { ground: 0 })
      return { model, frame, colors: COLORS[species], species }
    }),
  )
  const places = render.forestPlaces({
    seed: SEED,
    count: 90,
    inner: 4,
    outer: 46,
    variants: variants.length,
    height: () => 0,
    gap: 3.2,
    clump: 0.45,
  })
  const forest = render.createForest(lit as never, {
    variants,
    places,
    near: 30,
    fade: [0.3, 1],
    maxLeaves: Math.round(1600 * stage.look.density),
  })
  stage.scene.add(forest.group)
  return { forest, species: variants.map((variant) => variant.species) }
}

/** Each species' place in its year, worked out once a day. */
function calendar(growth: typeof Growth, species: readonly string[]) {
  let years = { day: -1, of: new Map<string, ReturnType<typeof growth.yearState>>() }
  return (day: number) => (variant: number) => {
    if (day !== years.day) years = { day, of: new Map() }
    const name = species[variant]!
    let known = years.of.get(name)
    if (!known) {
      known = growth.yearState({
        species: name,
        day,
        year: 2026,
        hemisphere: 'north',
        climate: 'temperate',
      })
      years.of.set(name, known)
    }
    return known
  }
}

/** What the trees are lit by and seen through, read off the stage as it stands. */
function airOf({ sun, sky, scene, finish }: KeelStage) {
  const { fog } = scene
  return {
    light: sky.color
      .clone()
      .multiplyScalar(sky.intensity)
      .add(sun.color.clone().multiplyScalar(sun.intensity * 0.45))
      .toArray(),
    fog: fog ? { color: fog.color.toArray(), near: fog.near, far: fog.far } : null,
    ...(finish ? { dither: finish.ditherOffset() } : {}),
  }
}

async function build(stage: KeelStage, s: Scene) {
  const [growth, render, light] = await Promise.all([
    import('@kerf-js/keel/modules/tree-growth'),
    import('@kerf-js/keel/modules/tree-render'),
    import('@kerf-js/keel/modules/world-light'),
  ])
  const { forest, species } = plant(stage, s.lit, growth, render)
  const yearOn = calendar(growth, species)
  let litHour = -1
  return (seconds: number) => {
    const at = tracks.at(grove.progress)
    stage.camera.position.set(at.x, at.y, at.z)
    stage.camera.lookAt(0, at.lookY, 0)
    stage.camera.fov = at.fov
    stage.camera.updateProjectionMatrix()
    // The sun moves a quarter hour at a time: world-light is cheap, but the air need not change every frame.
    const hour = Math.round(at.hour * 4) / 4
    if (hour !== litHour) {
      litHour = hour
      const timestamp = Date.UTC(2026, 0, Math.round(at.day), hour, 0)
      const world = light.worldLight({ timestamp, lat: 47, lon: 0, climate: 'temperate' })
      grove.world = world
      stage.light(world)
    }
    forest.update({
      camera: stage.camera,
      renderer: s.renderer as never,
      year: yearOn(Math.round(at.day)),
      elapsed: seconds,
      wind: 0.3,
      ...airOf(stage),
    })
    // The forest builds its levels as trees come near; a grove this close wants each to throw a shadow.
    for (const mesh of (forest.group as { children: { castShadow: boolean }[] }).children)
      mesh.castShadow = true
    grove.triangles = forest.levels.triangles
  }
}

export const Grove = defineSurface<{ look: LookKind }, 'keel-lit'>({
  name: 'grove',
  kind: 'keel-lit',
  maxDpr: 1.5,
  setup(s, props) {
    let stage: KeelStage | undefined
    let step: ((seconds: number) => void) | undefined
    let wearing: LookKind = props.look
    const scrub = progress(s.el.closest('.scene') ?? s.el, {
      onChange(value) {
        grove.progress = value
        grove.band?.setEnergy(energyAt(value))
        s.invalidate()
      },
    })
    void keelStage(s, { prefer: wearing }).then(async (made) => {
      step = await build(made, s)
      stage = made
      grove.stage = made
      grove.ready = true
      s.invalidate()
    })
    s.frame((time) => {
      const look = props.look
      if (!stage || !step) return
      if (look !== wearing) {
        wearing = look
        void stage.setLook(look).then(() => (grove.look = look))
      }
      step(time.seconds)
      stage.render()
    })
    return () => {
      scrub.destroy()
      stage?.dispose()
    }
  },
})

export function GrovePage() {
  const look = state<LookKind>('realism')
  const sound = state(false)
  const toggleSound = () => {
    sound.value = !sound.value
    void setSound(sound.value)
  }
  return (
    <main>
      <section class="scene">
        <div class="pin">
          <Surface
            use={Grove}
            look={look.value}
            label="A generated grove, from spring morning to autumn dusk"
          />
          <h1 class="title">Grove</h1>
          <div class="controls" role="group" aria-label="Look and sound">
            <button
              type="button"
              aria-pressed={look.value === 'realism'}
              onClick={() => (look.value = 'realism')}
            >
              Lit
            </button>
            <button
              type="button"
              aria-pressed={look.value === 'pixel'}
              onClick={() => (look.value = 'pixel')}
            >
              Dithered
            </button>
            <button type="button" aria-pressed={sound.value} onClick={toggleSound}>
              Sound
            </button>
          </div>
        </div>
      </section>
      <section class="paper">
        <h2>Nothing here was drawn by hand.</h2>
        <p>
          Every tree is grown from a seed, the light is the sun’s for the hour, and the same scene
          wears either look. Scroll back up to scrub it.
        </p>
      </section>
    </main>
  )
}
