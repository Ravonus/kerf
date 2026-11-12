// A portrait over a painted plate, both generated off the main thread with `generate`: the bust is meshed in one
// worker and the plate painted in another while this thread loads the renderer. `?here` builds both on this thread
// instead, the way a page did before, so the e2e can compare the long tasks of the two.
import { render } from '@kerf-js/core/dom'
import { defineSurface, Surface } from '@kerf-js/core/surface'
import { generate, type PlateResult } from '@kerf-js/keel/generate'
import type { Bust } from '@kerf-js/keel/modules/portrait'

const here = new URLSearchParams(location.search).has('here')
/** What the e2e test reads: when the first frame was drawn, and how long the build waited on its data. */
const sitter = { ready: 0, waited: 0, here }

const PLATE_VERTEX = `varying vec2 vUv;
void main() { vUv = position.xy + 0.5; gl_Position = vec4(position.xy * 2.0, 0.9999, 1.0); }`
const PLATE_FRAGMENT = `uniform sampler2D uPlate; varying vec2 vUv;
void main() { gl_FragColor = vec4(pow(texture2D(uPlate, vec2(vUv.x, 1.0 - vUv.y)).rgb, vec3(2.2)), 1.0); }`

async function data(width: number, height: number, gl: WebGL2RenderingContext) {
  const portrait = await import('@kerf-js/keel/modules/portrait')
  const { recipe, palette } = portrait.sitterOf(
    portrait.portraitSettings({ seed: 7, face: 'A', detail: 'hero', hand: 'pinch' }),
  )
  if (!here) {
    const [bust, plate] = await Promise.all([
      generate('bust', recipe),
      generate('plate', { width, height }),
    ])
    return { portrait, palette, bust: bust as Bust, plate }
  }
  const painting = await import('@kerf-js/keel/modules/plate-painter')
  const bust = portrait.buildBust(recipe)
  const plan = painting.planPlate(painting.LAKE_VALLEY)
  const painter = painting.createPlatePainter(gl)
  const view = painting.coverCrop(plan.aspect, width / height)
  const plate = painter.read(painter.paint(plan, { width, height, view }))
  painter.dispose()
  return { portrait, palette, bust, plate: plate as unknown as PlateResult }
}

const Sitter = defineSurface<object, 'keel-lit'>({
  name: 'sitter',
  kind: 'keel-lit',
  maxDpr: 1,
  setup(s) {
    const { lit, renderer } = s
    const stage = new lit.Stage()
    const camera = new lit.PerspectiveCamera(30, 16 / 10, 0.05, 50)
    camera.position.set(0.2, 0.05, 1.6)
    camera.lookAt(0, 0.05, 0)
    const key = new lit.SunLight('#fff1dc', 2.2)
    key.position.set(-2, 2.5, 3)
    stage.add(key, new lit.SkyLight('#c9d6d9', '#273632', 0.9))
    let drawn = false
    const asked = performance.now()
    const { width, height } = s.size.value
    void data(width, height, renderer.getContext()).then(({ portrait, palette, bust, plate }) => {
      sitter.waited = Math.round(performance.now() - asked)
      const texture = new lit.DataTexture(plate.data, plate.width, plate.height)
      texture.needsUpdate = true
      const material = new lit.CustomMaterial({
        uniforms: { uPlate: { value: texture } },
        vertexShader: PLATE_VERTEX,
        fragmentShader: PLATE_FRAGMENT,
      })
      const backdrop = new lit.Mesh(lit.plane(1, 1), material)
      backdrop.frustumCulled = false
      backdrop.renderOrder = -1
      const figure = portrait.createPortrait(lit as never, bust, palette)
      stage.add(backdrop, figure.group)
      figure.shadows(renderer as never)
      s.invalidate()
    })
    s.frame(() => {
      camera.aspect = s.size.value.width / Math.max(1, s.size.value.height)
      camera.updateProjectionMatrix()
      renderer.render(stage, camera)
      if (!drawn && stage.children.length > 2) {
        drawn = true
        sitter.ready = Math.round(performance.now())
      }
    })
  },
})

render(
  () => <Surface use={Sitter} label="A portrait over a painted lake" />,
  document.getElementById('app')!,
)
Object.assign(window, { sitter })
