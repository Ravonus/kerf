// The dither look: a stage (../stage) whose painters draw in whole cells of veneer's inks. Each frame rebuilds typed arrays, a
// field first, then the pieces in document order, then presses and the rail, and quantizes them once to the canvas, so a
// piece costs only the cells it covers. Painters draw with a brush in tones 0–1, and the stage decides the inks.
import { LOOKS, stage, type Piece, type StageLayout } from '../stage'
import type { Action } from '../store'
import type { Field, FieldName } from './fields'
import type { Ramp } from './ramp'
import { tile, type Pattern } from './tiles'
import { stageRenderer, type StageState } from './stage-render'

/** The skins a stage paints itself. Any other name needs a painter of your own. */
export type Skin =
  | 'button'
  | 'card'
  | 'panel'
  | 'bar'
  | 'field'
  | 'menu'
  | 'option'
  | 'check'
  | 'switch'
  | 'range'
  | 'meter'
  | 'chip'
  | 'rule'
  | 'type'
  | 'art'
  | 'clear'

/** A piece as the dither look sees it: in cells, with its ramp's id (`data-ramp`, else accent for controls and the stage's ramp for the rest). */
export interface DitherPiece extends Piece {
  ramp: number
}

/** A box in cells, rounded by `r` cells. A piece is one, so a painter can hand its piece straight to `paint` and `ring`. */
export interface Cells {
  x: number
  y: number
  w: number
  h: number
  r?: number | undefined
}

/** How `ring` draws its border: `t` cells thick (1), in `ramp`, dashed every `dash` cells. */
export interface Line {
  t?: number | undefined
  ramp?: number | undefined
  dash?: number | undefined
}

/** What a painter draws with. Tones run 0–1 over a ramp's inks, and 0 clears a cell to the page underneath. */
export interface Brush {
  cols: number
  rows: number
  time: number
  set(x: number, y: number, tone: number, ramp?: number): void
  /** Fills a box, rounded by its `r` cells. `tone` can be a function of the cell, returning a negative number to skip it. */
  paint(box: Cells, tone: number | ((x: number, y: number) => number), ramp?: number): void
  /** A border inside the box, `t` cells thick (1). With `dash` it marches round as time passes, for focus. */
  ring(box: Cells, tone: number, line?: Line): void
  /** The stage's field at a cell, 0–1. */
  field(x: number, y: number): number
  /** The dither threshold at a cell, 0–1: compare a coverage with it for an ordered dissolve. */
  threshold(x: number, y: number): number
  /** A ramp's id, for `set`, `paint` and `ring`. */
  ramp(ramp: Ramp): number
}

/** Paints one skin. It runs every frame the stage paints, so it should only draw. */
export type DitherPainter = (piece: DitherPiece, brush: Brush) => void

/** Options for a dither stage. */
export interface DitherStageOptions {
  layout?: StageLayout | undefined
  /** The field's inks, and the ramp of pieces that name none. Default neutral. */
  ramp?: Ramp | undefined
  /** The ground: a named field or your own function of (x, y, t). */
  kind?: FieldName | Field | undefined
  /** How strong the ground is, 0–1. 0 leaves only the pieces. */
  ground?: number | undefined
  /** The dither: an ordered Bayer matrix (`bayer2`, `bayer4`, the default, `bayer8`), blue noise, or halftone dots. */
  pattern?: Pattern | undefined
  /** CSS pixels per cell. */
  cell?: number | undefined
  /** Multiplies the tier's speed. 0 holds the ground still; pieces still answer. */
  speed?: number | undefined
  /** How far the ground travels for each pixel scrolled, 0–1: parallax. */
  drift?: number | undefined
  /** Paints a scroll rail on the right that can be dragged, in place of the native bar. */
  rail?: boolean | undefined
  /** Covers everything under the pieces with a dithered scrim, this dense: for a modal's stage. */
  veil?: number | undefined
  /** The inks a press rings out in, or false for none. Default accent. */
  ripple?: Ramp | false | undefined
  /** Painters for your own skins, or to replace a built-in one. */
  painters?: Record<string, DitherPainter> | undefined
  /** Caps the frame rate while it animates. Uncapped by default, at the display's rate. */
  fps?: number | undefined
}

export { LEVEL, PAINTERS } from './stage-painters'
/** A stage in the dither look. The canvas sits in a paint layer that is the stage's first child. */
export function ditherStage(
  canvas: HTMLCanvasElement,
  options: DitherStageOptions = {},
): Action<DitherStageOptions> {
  const st: StageState = {
    o: options,
    host: canvas.parentElement?.parentElement ?? canvas,
    cols: 0,
    rows: 0,
    time: 0,
    clock: 0,
    seenAt: 0,
    tone: new Float32Array(0),
    ink: new Uint8Array(0),
    ground: new Float32Array(0),
    out: new Uint32Array(0),
    image: undefined,
    pattern: tile(options.pattern ?? 'bayer4'),
    ramps: new Map(),
    inks: [],
    masks: new WeakMap(),
    arts: new WeakMap(),
    current: undefined,
    scene: undefined,
    paper: 0,
  }

  const { paint, retheme } = stageRenderer(st)

  const core = () => ({
    layout: st.o.layout,
    cell: st.o.cell ?? 3,
    rail: st.o.rail,
    fps: st.o.fps,
    animate: (st.o.ground ?? 0.5) > 0 && (st.o.speed ?? 1) > 0,
    paint,
    onTheme: retheme,
  })
  const s = stage(canvas, core())
  // A float out of this stage, a select's list, is dithered too: clean paper, no rail, veil or ripple.
  LOOKS.set(st.host, (c) => {
    const f = ditherStage(c, {
      ...st.o,
      layout: 'box',
      rail: false,
      veil: undefined,
      ripple: false,
      ground: 0,
    })
    return { update() {}, destroy: () => f.destroy() }
  })
  void document.fonts?.ready.then(() => {
    st.masks = new WeakMap()
  })
  return {
    update(next) {
      st.o = next
      st.pattern = tile(st.o.pattern ?? 'bayer4')
      retheme()
      s.update(core())
    },
    destroy: () => s.destroy(),
  }
}
