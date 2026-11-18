type Point = { x: number; y: number }
const CELLS = 64

/** A bounded, normalized scratch mask. Repeated passes over one spot only count once. */
export function scratchMask() {
  const mask = new Set<number>()
  const stroke = (from: Point, to: Point) => {
    const dx = (to.x - from.x) * CELLS
    const dy = (to.y - from.y) * CELLS
    const steps = Math.ceil(Math.hypot(dx, dy))
    for (let step = 0; step <= steps; step++) {
      const progress = step / (steps || 1)
      const x = Math.floor(from.x * CELLS + dx * progress)
      const y = Math.floor(from.y * CELLS + dy * progress)
      for (let py = Math.max(0, y - 4); py <= Math.min(CELLS - 1, y + 4); py++)
        for (let px = Math.max(0, x - 4); px <= Math.min(CELLS - 1, x + 4); px++)
          if (Math.hypot(px - x, py - y) <= 4) mask.add(py * CELLS + px)
    }
    return mask.size / (CELLS * CELLS)
  }

  const erase = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const w = width / CELLS
    const h = height / CELLS
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    for (const cell of mask)
      ctx.fillRect((cell % CELLS) * w, Math.floor(cell / CELLS) * h, Math.ceil(w), Math.ceil(h))
    ctx.restore()
  }

  return { stroke, erase }
}
