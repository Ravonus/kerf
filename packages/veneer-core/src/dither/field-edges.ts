import type { Fade } from './field'

const smooth = (v: number) => {
  const k = v < 0 ? 0 : v > 1 ? 1 : v
  return k * k * (3 - 2 * k)
}

export function fieldEdges(f: Fade | undefined, cells: number, cols: number, rows: number) {
  const ground = f ? new Float32Array(cells) : undefined
  if (ground)
    for (let y = 0, i = 0; y < rows; y++)
      for (let x = 0; x < cols; x++, i++) {
        const u = x / cols,
          v = y / rows
        ground[i] =
          f === 'left'
            ? smooth(u * 1.8 - 0.5)
            : f === 'right'
              ? smooth((1 - u) * 1.8 - 0.5)
              : f === 'top'
                ? smooth(v * 1.8 - 0.5)
                : f === 'bottom'
                  ? smooth((1 - v) * 1.8 - 0.5)
                  : smooth(Math.min(u, 1 - u) * 6) * smooth(Math.min(v, 1 - v) * 6)
      }
  return ground
}
