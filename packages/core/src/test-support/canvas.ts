// ---- surfaces: jsdom has no canvas ----------------------------------------------------------------------------------

const calls = new WeakMap<object, { name: string; args: unknown[] }[]>()

/** A context that records every method call and keeps every property set. Reads of anything else return a no-op. */
function recording(canvas: HTMLCanvasElement) {
  const log: { name: string; args: unknown[] }[] = []
  calls.set(canvas, log)
  const values: Record<string, unknown> = {}
  const ctx: unknown = new Proxy(
    {},
    {
      get(_, key: string) {
        if (key in values) return values[key]
        if (key === 'measureText')
          return (text: string) => ({
            width: text.length * 8,
            fontBoundingBoxAscent: 12,
            fontBoundingBoxDescent: 4,
          })
        if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) })
        if (key === 'getExtension') return () => null
        if (key === 'canvas') return canvas
        return (...args: unknown[]) => {
          log.push({ name: key, args })
          return ctx
        }
      },
      set(_, key: string, value) {
        values[key] = value
        return true
      },
    },
  )
  return ctx
}

/** The calls a surface made on this canvas's context, in order (jsdom only): `canvasCalls(c).filter(c => c.name === 'fillText')`. */
export const canvasCalls = (canvas: HTMLCanvasElement) => calls.get(canvas) ?? []

export function installCanvas() {
  if (typeof HTMLCanvasElement !== 'undefined') {
    const contexts = new WeakMap<object, unknown>()
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
      if (!contexts.has(this)) contexts.set(this, recording(this))
      return contexts.get(this)
    } as unknown as typeof HTMLCanvasElement.prototype.getContext
  }
}

/** A deterministic `text.measure` for jsdom: every character is 8 px wide and lines break at spaces. */
export function fakeMeasure() {
  type H = { exact: boolean; ready: null; text: string }
  const wrap = (h: H, width: number) => {
    const out: { width: number; text: string }[] = []
    let line = ''
    for (const word of h.text.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (line && next.length * 8 > width) {
        out.push({ width: line.length * 8, text: line })
        line = word
      } else line = next
    }
    if (line) out.push({ width: line.length * 8, text: line })
    return out
  }
  return {
    prepare: (text: string): H => ({ exact: true, ready: null, text }),
    layout: (h: H, width: number, lineHeight: number) => {
      const n = wrap(h, width).length
      return { height: n * lineHeight, lineCount: n }
    },
    lines: wrap,
    lineText: (_: H, line: { text: string }) => line.text,
    clear() {},
  }
}
