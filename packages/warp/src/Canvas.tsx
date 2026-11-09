import { surface, type Frame, type SurfaceOptions } from '@weft-js/warp-core/canvas'
import { state, untrack } from '@weft-js/core'
import { uid } from '@weft-js/warp-core'
import { floatStage, stage, stageSelect, type StageOptions } from '@weft-js/warp-core/stage'
import { use } from '@weft-js/warp-core/weft'
import './styles'
import '@weft-js/warp-core/styles/canvas/canvas.css'
import '@weft-js/warp-core/styles/canvas/stage.css'

export type { Frame, Pointer } from '@weft-js/warp-core/canvas'
export type {
  Piece as StagePiece,
  Press,
  Scene,
  Scroll,
  StageLayout,
  StagePainter,
  Word,
} from '@weft-js/warp-core/stage'

/** Props for Canvas. */
export interface CanvasProps {
  /** Paints one frame: `ctx` is already scaled to CSS pixels. Return true to be called again without `animate`. */
  draw: (frame: Frame) => boolean | void
  /** Moves at balanced and vivid. Quiet and reduced motion paint one frame, with `still` set. */
  animate?: boolean
  /** Caps the frame rate while it animates. Uncapped by default, at the display's rate. */
  fps?: number
  /** Whole-cell mode: `width` and `height` count cells of this many CSS pixels, scaled up without smoothing. */
  cell?: number
  /** Settings for the 2D context, such as `{ alpha: false }`. Read once, when the canvas attaches. */
  context?: SurfaceOptions['context']
  /** Called before the repaint when a theme, tier or motion dial changes around the canvas. Read colours again here. */
  onTheme?: () => void
  /** Track the pointer into `frame.pointer`, and repaint when it moves over the canvas. */
  pointer?: boolean
  /** Names the drawing (role="img"). Without one it is decorative. */
  label?: string | undefined
  [attr: string]: unknown
}

/** A canvas that handles pixel ratio, resize, off-screen and reduced motion, for anything Warp doesn't draw itself (08 §6.7). */
export function Canvas({
  draw,
  animate,
  fps,
  cell,
  context,
  onTheme,
  pointer,
  label,
  ...rest
}: CanvasProps) {
  let node: HTMLCanvasElement | undefined
  use(
    surface,
    () => node,
    () => ({ draw, animate, fps, cell, context, onTheme, pointer }),
  )
  return (
    <div {...rest} data-scope="canvas">
      <canvas
        ref={(n) => (node = n)}
        role={label ? 'img' : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : 'true'}
      ></canvas>
    </div>
  )
}

/** Props for CanvasStage. */
export interface CanvasStageProps extends StageOptions {
  /** `box` paints its own block; `scroll` is a scroller whose view it paints; `page` paints the viewport, for a whole page. */
  layout?: StageOptions['layout']
  /** A modal's stage: the dialog spans the viewport and the stage centres its panel. */
  veil?: boolean | undefined
  children?: unknown
  [attr: string]: unknown
}

/**
 * A canvas that paints the page laid out inside it (08 §6.8). Mark any element `data-skin="button"`, `card`, or a name of
 * your own: it keeps its layout, focus, typing and semantics, and your painters draw it with a 2D context, states and all.
 */
export function CanvasStage({
  layout = 'box',
  painters,
  background,
  overlay,
  paint,
  animate,
  cell,
  fps,
  rail,
  context,
  onTheme,
  veil,
  children,
  ...rest
}: CanvasStageProps) {
  let node: HTMLCanvasElement | undefined
  use(
    stage,
    () => node,
    () => ({
      layout,
      painters,
      background,
      overlay,
      paint,
      animate,
      cell,
      fps,
      rail,
      context,
      onTheme,
    }),
  )
  return (
    <div
      {...rest}
      data-scope="stage"
      data-layout={layout}
      data-rail={rail ? '' : undefined}
      data-veil={veil ? '' : undefined}
    >
      <div data-part="paint" aria-hidden="true">
        <canvas ref={(n) => (node = n)}></canvas>
      </div>
      {children}
    </div>
  )
}

/** One choice of a StageSelect: a string is its own value and label. */
export type StageOption = string | { value: string; label: string; disabled?: boolean | undefined }

/** Props for StageSelect. */
export interface StageSelectProps {
  options: StageOption[]
  /** The value it starts on; the first option when left out. */
  value?: string | undefined
  /** Puts the value in a form, through a hidden input. */
  name?: string | undefined
  disabled?: boolean | undefined
  /** Hears each value picked. */
  onChange?: ((value: string) => void) | undefined
  [attr: string]: unknown
}

/**
 * A select a stage draws, list and all (APG select-only combobox). Its trigger is a `field` skin; its list floats in the
 * top layer as a stage of its own, in the look of the one around it, with `menu` and `option` skins. Wrap it in a
 * `<label>` to name it.
 */
export function StageSelect({
  options,
  value,
  name,
  disabled,
  onChange,
  ...rest
}: StageSelectProps) {
  const items = untrack(() => options).map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o,
  )
  const current = state(untrack(() => value) ?? items[0]?.value ?? '')
  const id = uid('stage-sel')
  let trigger: HTMLButtonElement | undefined, paint: HTMLCanvasElement | undefined
  use(
    stageSelect,
    () => trigger,
    () => ({
      value: current.value,
      onPick: (v: string) => {
        current.value = v
        onChange?.(v)
      },
    }),
  )
  use(floatStage, () => paint)
  return (
    <span data-part="select">
      <button
        {...rest}
        ref={(n) => (trigger = n)}
        type="button"
        data-skin="field"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded="false"
        aria-controls={id}
        disabled={disabled}
      >
        {items.find((i) => i.value === current.value)?.label ?? ''}
      </button>
      <div popover="manual" data-scope="stage" data-layout="box" data-part="float">
        <div data-part="paint" aria-hidden="true">
          <canvas ref={(n) => (paint = n)}></canvas>
        </div>
        <div role="listbox" id={id} data-skin="menu">
          {items.map((o, i) => (
            <div
              key={o.value}
              role="option"
              id={`${id}-${i}`}
              data-skin="option"
              data-value={o.value}
              aria-selected={current.value === o.value ? 'true' : 'false'}
              aria-disabled={o.disabled ? 'true' : undefined}
            >
              {o.label}
            </div>
          ))}
        </div>
      </div>
      {name && <input type="hidden" name={name} value={current.value} />}
    </span>
  )
}
