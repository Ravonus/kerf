import { onMount, onCleanup, state, type State } from './index'
import type { MediaAsset, MediaProps } from './media'
import { mediaStyle } from './media-style'
import type { FramePlayer } from './media-frames'
import type { Timeline } from './media-timeline'
function mountFrameView(
  element: () => HTMLCanvasElement,
  src: MediaAsset,
  options: {
    timeline: Timeline | undefined
    playback?: MediaProps['playback']
    autoplay: boolean
    muted: boolean
    loop: boolean
    priority: boolean
    bind: (player: FramePlayer) => void
    update: () => void
    error: () => void
  },
) {
  const { bind, update, error } = options
  onMount(() => {
    const el = element(),
      controller = new AbortController()
    let player: FramePlayer | undefined, unbind: (() => void) | undefined
    for (const event of ['play', 'pause', 'timeupdate', 'volumechange'])
      el.addEventListener(event, update)
    el.addEventListener('error', error)
    void import('./media-frames')
      .then(async (module) => {
        if (controller.signal.aborted) return
        player = module.createFramePlayer(el, src, {
          signal: controller.signal,
          loop: options.loop,
          muted: options.muted,
        })
        bind(player)
        unbind = options.timeline?.bind(player)
        options.playback?.(player)
        if (options.autoplay) await player.play()
        else if (options.priority) player.currentTime = 0
      })
      .catch(() => {
        if (!controller.signal.aborted) el.dispatchEvent(new Event('error'))
      })
    onCleanup(() => {
      unbind?.()
      controller.abort()
      player?.destroy()
      for (const event of ['play', 'pause', 'timeupdate', 'volumechange'])
        el.removeEventListener(event, update)
      el.removeEventListener('error', error)
    })
  })
}
/** Frame delivery is an optional chunk; ordinary image/video pages do not load its player. */
export function framed({
  src,
  alt,
  decorative,
  priority,
  focus,
  fit,
  timeline,
  playback,
  controls = true,
  autoplay,
  autoPlay,
  muted = true,
  loop,
  ref,
  ...rest
}: MediaProps) {
  let el!: HTMLCanvasElement
  let player: FramePlayer | undefined
  const { running, time, silent, failed } = frameViewState(!!muted)
  const error = () => {
    failed.value = true
  }
  mountFrameView(() => el, src, {
    timeline,
    playback,
    autoplay: !!(autoplay || autoPlay),
    muted: !!muted,
    loop: !!loop,
    priority: !!priority,
    bind(value) {
      player = value
    },
    update() {
      if (player) {
        running.value = !player.paused
        time.value = player.currentTime
        silent.value = player.muted
      }
    },
    error,
  })

  return (
    <>
      <canvas
        ref={(node: HTMLCanvasElement) => {
          el = node
          if (typeof ref === 'function') ref(node)
        }}
        width={src.width}
        height={src.height}
        role="img"
        aria-label={decorative ? undefined : alt}
        aria-hidden={decorative ? 'true' : undefined}
        style={`${mediaStyle(src, focus, fit)};${src.poster ? `background-image:url(${JSON.stringify(src.poster)});background-size:${fit ?? 'contain'};background-position:center;background-repeat:no-repeat` : ''}`}
        data-media-frames
        {...rest}
      />
      {controls && (
        <FrameControls
          player={() => player}
          src={src}
          alt={alt}
          running={running}
          time={time}
          silent={silent}
          failed={failed}
          error={error}
        />
      )}
    </>
  )
}

function FrameControls(props: {
  player: () => FramePlayer | undefined
  src: MediaAsset
  alt: string
  running: State<boolean>
  time: State<number>
  silent: State<boolean>
  failed: State<boolean>
  error: () => void
}) {
  return (
    <div data-media-controls role="group" aria-label={`${props.alt} playback`}>
      <button
        type="button"
        onClick={() => {
          if (props.player()?.paused) void props.player()!.play().catch(props.error)
          else props.player()?.pause()
        }}
      >
        {props.running.value ? 'Pause' : 'Play'}
      </button>
      <input
        type="range"
        min="0"
        max={props.src.duration ?? 0}
        step="0.01"
        value={props.time.value}
        aria-label="Playback position"
        onInput={(event) => {
          if (props.player()) props.player()!.currentTime = Number(event.currentTarget.value)
        }}
      />
      {props.src.audio && (
        <button
          type="button"
          aria-pressed={!props.silent.value}
          onClick={() => {
            if (props.player()) props.player()!.muted = !props.player()!.muted
          }}
        >
          {props.silent.value ? 'Enable audio' : 'Mute audio'}
        </button>
      )}
      {props.failed.value && <p role="status">Media could not load.</p>}
    </div>
  )
}

function frameViewState(muted: boolean) {
  return { running: state(false), time: state(0), silent: state(muted), failed: state(false) }
}
