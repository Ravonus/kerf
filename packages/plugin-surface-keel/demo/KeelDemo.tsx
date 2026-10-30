// KEEL's scaffold demo (keel-engine packages/react/examples/KeelDemo.tsx), ported. The React version needs a memoised
// recipe, a hoisted `setup` so the GL context isn't rebuilt, and `onReady` to reach the clock. Here `setup` runs once and
// the button reads a box.
import { onMount } from 'weft'
import { clock, defineSurface, Surface } from 'weft/surface'
import { recipeTheme, themeTokens } from '@weft/plugin-surface-keel/theme'
import '@weft/plugin-surface-keel/styles.css'

const recipe = { seed: 'keel/react-demo', culture: 'clean' }
const theme = recipeTheme(recipe)
const css = Object.entries(themeTokens(theme, 2)).map(([k, v]) => `${k}:${v}`).join(';')

export const colours: number[][] = [...theme.palette.surface, ...theme.palette.accent].map((c: number) => [c & 255, (c >>> 8) & 255, (c >>> 16) & 255])
export const ramps = { surface: [0, theme.palette.surface.length], accent: [theme.palette.surface.length, theme.palette.accent.length] }
export const world = { boxes: [{ c: [0, -0.5, 0], h: [5, 0.5, 5], mat: 0 }, { c: [0, 1, 0], h: [0.75, 1, 0.75], mat: 1 }] }
export const view = (seconds: number) => ({ eye: [Math.sin(seconds) * 5, 3, Math.cos(seconds) * 5], target: [0, 1, 0], time: seconds })

export const KeelScene = defineSurface({
  name: 'keel-demo',
  kind: 'keel-pixel',
  pixel: { width: 256, height: 144 },
  fps: 30,
  setup(s) {
    s.px.setPalette(colours, ramps)
    s.px.setMaterials([{ ramp: 'surface' }, { ramp: 'accent' }])
    s.px.setWorld(world)
    s.px.setStyle({ screen: 4 })
    s.frame(t => s.px.render(view(t.seconds)))
  },
})

export function KeelDemo() {
  onMount(() => {
    clock.pause()
    if (new URLSearchParams(location.search).get('cinematic') === '1') document.querySelector('[data-surface="keel-demo"] canvas')?.setAttribute('data-cinematic', 'ready')
  })
  return (
    <div data-keel-theme={theme.key} style={css}>
      <Surface use={KeelScene} label="KEEL scene" style="max-width:640px" />
      <section class="keel-panel" aria-label="Scene controls">
        <button class="keel-button" type="button" onClick={() => (clock.playing.value ? clock.pause() : clock.play())}>{clock.playing.value ? 'PAUSE' : 'PLAY'}</button>
      </section>
    </div>
  )
}
