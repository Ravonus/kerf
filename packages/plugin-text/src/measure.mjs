// text.measure@1 (research 33 §6). The slot's generated module calls this through `import()`, so nothing here is in an
// app until something measures. `slim` is @weft/text-engine, which already has the slot's shape.

/** Pretext's own lines carry their text, so `lineText` only has to hand it back. */
function pretext(P) {
  return {
    prepare: (text, font, opts) => Object.assign(P.prepareWithSegments(text, font, opts), { exact: true, ready: null }),
    layout: (h, width, lineHeight) => P.layout(h, width, lineHeight),
    lines: (h, width) => P.layoutWithLines(h, width, 1).lines,
    lineText: (_, line) => line.text,
    clear: P.clearCache,
  }
}

export async function createMeasure({ engine = 'slim' } = {}) {
  if (engine === 'pretext') return pretext(await import('@chenglou/pretext'))
  const { loadTextEngine } = await import('@weft/text-engine')
  return loadTextEngine()
}
