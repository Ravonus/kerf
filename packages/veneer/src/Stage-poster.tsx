// A scene's poster, pinned behind its section: a colour, an image URL or a baked still.
import type { ScenePoster } from './Stage-types'

const BAKED: Record<string, ScenePoster> = {}

/** Adds baked posters by scene id, for `poster="bake"`: a bake's module calls it on import, before any render. */
export function bakedPosters(posters: Readonly<Record<string, ScenePoster>>) {
  Object.assign(BAKED, posters)
  return posters
}

export const posterOf = (poster: string | ScenePoster | undefined, id: string | undefined) =>
  poster === 'bake' ? BAKED[id ?? ''] : poster

export const PINNED = 'position:sticky;top:0;height:100lvh;margin-bottom:-100lvh'
const COLOUR = /^(#|rgba?\(|hsla?\(|oklch\(|color\(|[a-z-]+-gradient\()/i
const FILL = 'display:block;width:100%;height:100%;object-fit:cover'

/** A poster's background: a colour or gradient as it is, anything else as an image URL. */
const backdrop = (poster: string) =>
  COLOUR.test(poster) ? poster : `center/cover no-repeat url("${poster.replaceAll('"', '%22')}")`

function underlay({ desktop }: ScenePoster) {
  const tiny = desktop.placeholder ? ` url("${desktop.placeholder}") center/cover no-repeat` : ''
  return `${desktop.dominant ?? 'transparent'}${tiny}`
}

/** A baked poster: the tall still where the screen is taller than it is wide, the wide one elsewhere. */
function Baked(props: { poster: ScenePoster }) {
  const { desktop, mobile } = props.poster
  return (
    <picture>
      {mobile ? (
        <source media="(max-aspect-ratio: 1/1)" srcset={mobile.src} type={mobile.type} />
      ) : null}
      <img
        src={desktop.src}
        alt=""
        width={desktop.width}
        height={desktop.height}
        decoding="async"
        loading="lazy"
        style={FILL}
      />
    </picture>
  )
}

/** The layer pinned behind a scene's section, or nothing without a poster. */
export function posterLayer(poster: string | ScenePoster | undefined) {
  if (!poster) return null
  const baked = typeof poster === 'string' ? null : poster
  return (
    <div
      data-scene-poster
      aria-hidden="true"
      style={`${PINNED};z-index:-1;background:${baked ? underlay(baked) : backdrop(poster as string)}`}
    >
      {baked ? <Baked poster={baked} /> : null}
    </div>
  )
}
