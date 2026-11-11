import { reducedMotion } from '../motion'
import { rasterMask } from './mask'
import { forces } from './pointer'
import { fieldEdges } from './field-edges'
import type { FieldState } from './field-state'

const family = (el: Element) => getComputedStyle(el).fontFamily || 'sans-serif'

export function fieldBuffers(v: FieldState, host: HTMLElement) {
  const modes = () => {
    const p = v.o.pointer
    return p ? (Array.isArray(p) ? p : [p]) : []
  }

  function grow(w: number, h: number) {
    v.cols = w
    v.rows = h
    v.cells = w * h
    v.tones = new Float32Array(v.cells)
    v.shown = new Float32Array(v.cells)
    v.heat = new Float32Array(v.cells)
    v.image = new ImageData(w, h)
    v.out = new Uint32Array(v.image.data.buffer)
    v.fresh = v.painted = false
    remask()
    reforce()
    edges()
  }
  const remask = () => {
    v.mask =
      v.o.mask && v.fontsReady && v.cols
        ? rasterMask(v.o.mask, v.cols, v.rows, family(host))
        : undefined
  }
  const reforce = () => {
    const m = modes()
    v.push =
      m.length && v.dials.reach > 0 && !reducedMotion(host) && v.cols
        ? forces(m, v.cols, v.rows, v.dials.reach)
        : undefined
  }

  const edges = () => {
    v.ground = fieldEdges(v.o.fade, v.cells, v.cols, v.rows)
  }

  return { grow, remask, reforce, edges }
}
