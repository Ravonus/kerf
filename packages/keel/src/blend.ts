// The stage's blend on KEEL's modules: every scene drawn through lit-finish, a hand-over through scene-blend (the less
// visible scene through a lighter finish at the levers' `blendScale`), and the active section's pass through
// section-post. `<Stage blend={keelBlend()}>`; the modules load once the stage's surface is up.
import type { SurfaceBase, SurfaceContext } from '@kerf-js/core/surface'
import type { BlendOptions, Levers, LiveScene, SceneBlend, ScenePost } from './scene'
import type { LitFinish } from '../vendor/modules/lit-finish.mjs'
import type { BlendSettings } from '../vendor/modules/scene-blend.mjs'
import type { PostSettings, PostValues } from '../vendor/modules/section-post.mjs'

/** Options for `keelBlend`. Each is that module's settings, checked and bounded by it. */
export interface KeelBlendOptions {
  /** lit-finish's settings for the finish every scene is drawn through. */
  readonly finish?: unknown
  /** scene-blend's: `seed`, `lineColour`, `lines`, `glow`... `scale` comes from the levers. */
  readonly blend?: Partial<Omit<BlendSettings, 'scale'>>
  /** section-post's: the paper `colour`, `tear`, `fibre`, `shadow`, `grain`... */
  readonly post?: Partial<PostSettings>
}

/** The less visible scene's finish: no ambient occlusion, bloom or TAA, which it would spend on pixels hardly seen. */
const LIGHT = { ao: 0, bloom: 0, taa: false }

/** A pass's values: a `#rrggbb` paper as display values, the rest as given. */
function valuesOf(post: ScenePost | null, hex: (value: string) => [number, number, number]) {
  if (!post) return {}
  const { colour, ...rest } = post
  return (
    colour === undefined
      ? rest
      : { ...rest, colour: typeof colour === 'string' ? hex(colour) : colour }
  ) as PostValues
}

/** Spends the levers on the main finish: bloom as a share of its own, and TAA. */
function spender(finish: LitFinish) {
  const { bloom, taa } = finish.settings
  return (levers: Levers) =>
    finish.setSettings({ ...finish.settings, bloom: bloom * levers.bloom, taa: taa && levers.taa })
}

/**
 * The blend a `<Stage>` draws every frame with: `<Stage blend={keelBlend({ blend: { seed: 7 } })}>`. A scene alone
 * goes through the finish too, so it looks the same before, during and after a hand-over.
 */
export function keelBlend(options: KeelBlendOptions = {}) {
  return async (surface: SurfaceBase): Promise<SceneBlend> => {
    const s = surface as SurfaceContext<'keel-lit'>
    const [finishing, blending, posting] = await Promise.all([
      import('../vendor/modules/lit-finish.mjs'),
      import('../vendor/modules/scene-blend.mjs'),
      import('../vendor/modules/section-post.mjs'),
    ])
    const lit = s.lit as never
    const renderer = s.renderer as never
    const main = finishing.createLitFinish(lit, renderer, options.finish)
    const scaled = finishing.createLitFinish(lit, renderer, {
      ...(options.finish as object),
      ...LIGHT,
    })
    const blend = blending.createSceneBlend(lit, renderer, { main, scaled }, options.blend)
    const post = posting.createSectionPost(lit, renderer, finishing, options.post)
    const spend = spender(main)
    let sized = ''
    let levers: Levers | null = null
    const fit = () => {
      const { width, height } = s.size.value
      const ratio = s.dpr.value
      const key = `${width}x${height}@${ratio}`
      if (key === sized) return
      sized = key
      main.setSize(width, height, ratio)
      blend.setSize(width, height, ratio)
      post.setSize(width, height, ratio)
    }
    const shot = (scene: LiveScene) => scene.shot() as Parameters<typeof blend.draw>[0]
    return {
      draw(a: LiveScene, b: LiveScene, t: number, o: BlendOptions) {
        fit()
        if (o.levers !== levers) {
          levers = o.levers
          spend(levers)
          if (blend.settings.scale !== levers.blendScale)
            blend.setSettings({ ...blend.settings, scale: levers.blendScale })
        }
        const look = {
          mode: o.mode,
          pointer: o.pointer,
          ...(o.centre && { centre: o.centre }),
          ...(!o.lines && { lines: { in: 0, out: 0 } }),
        }
        post.render(
          () => blend.draw(shot(a), shot(b), t, look),
          valuesOf(o.post, posting.displayColour),
        )
      },
      dispose() {
        blend.dispose()
        post.dispose()
        main.dispose()
        scaled.dispose()
      },
    }
  }
}
