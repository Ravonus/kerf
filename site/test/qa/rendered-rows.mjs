// Measure glyph rectangles so a highlighted span cannot hide a wrapped source line.
export function measureBlock(pre) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const box = pre.getBoundingClientRect()
  const preStyle = getComputedStyle(pre)
  const scrollable =
    pre.tabIndex >= 0 &&
    /^(auto|scroll)$/.test(preStyle.overflowX) &&
    pre.scrollWidth > pre.clientWidth
  let obstructed = false
  let ancestorLeft = -Infinity
  let ancestorRight = Infinity
  for (let parent = pre.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent)
    if (!/^(auto|scroll|hidden|clip)$/.test(style.overflowX)) continue
    const bounds = parent.getBoundingClientRect()
    ancestorLeft = Math.max(ancestorLeft, bounds.left)
    ancestorRight = Math.min(ancestorRight, bounds.right)
    if (bounds.left > box.left + 1 || bounds.right < box.right - 1) obstructed = true
  }
  const visible = (element) =>
    element.checkVisibility({ visibilityProperty: true, opacityProperty: true })
  const lines = [...pre.querySelectorAll('[data-part="line"]')].filter(visible)
  return {
    missing: !pre.querySelector('[data-part="line"]') && !!pre.textContent.trim(),
    scrollable,
    obstructed,
    lines: lines.map((line, index) => {
      const style = getComputedStyle(line)
      ctx.font = style.font
      const ch = ctx.measureText('0').width + (parseFloat(style.letterSpacing) || 0)
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
      const chars = []
      let node
      while ((node = walker.nextNode())) {
        if (!visible(node.parentElement)) continue
        let offset = 0
        for (const char of node.data) {
          if (!/\s/u.test(char)) {
            const range = document.createRange()
            range.setStart(node, offset)
            range.setEnd(node, offset + char.length)
            const r = range.getBoundingClientRect()
            chars.push({ char, top: r.top, left: r.left, right: r.right })
          } else {
            chars.push({ char })
          }
          offset += char.length
        }
      }
      const glyphs = chars.filter((c) => c.top !== undefined)
      const rows = []
      for (const glyph of glyphs) {
        if (!rows.some((row) => Math.abs(row.top - glyph.top) < 1)) rows.push(glyph)
      }
      let wordTop
      let splitWord = false
      for (const glyph of chars) {
        if (glyph.top === undefined || !/[\p{L}\p{N}_$]/u.test(glyph.char)) wordTop = undefined
        else if (wordTop === undefined) wordTop = glyph.top
        else if (Math.abs(wordTop - glyph.top) >= 1) splitWord = true
      }
      return {
        index: index + 1,
        text: line.textContent,
        rows,
        ch,
        splitWord,
        clippedByAncestor: glyphs.some(
          (g) =>
            (g.left < ancestorLeft - 1 && g.left >= box.left - 1) ||
            (g.right > ancestorRight + 1 && g.right <= box.right + 1),
        ),
        clippedLeft: glyphs.some((g) => g.left < box.left - 1),
        clippedRight: glyphs.some((g) => g.right > box.right + 1),
        fontSize: parseFloat(style.fontSize),
        indent: style.getPropertyValue('--indent').trim(),
        padding: parseFloat(style.paddingInlineStart),
        textIndent: parseFloat(style.textIndent),
        whiteSpace: style.whiteSpace,
        wrap: style.overflowWrap,
      }
    }),
  }
}

// Each failure names the block and source line, including the text that needs rewriting.
export function checkBlock(result, phone, label) {
  if (result.missing) throw new Error(`${label}: nonempty code block has no source-line markup`)
  for (const line of result.lines) {
    if (!line.rows.length) continue
    const where = `${label} line ${line.index} ${JSON.stringify(line.text.slice(0, 90))}`
    if (!phone && line.rows.length > 1)
      throw new Error(`${where}: wraps to ${line.rows.length} rows`)
    if (!phone) continue
    if (line.whiteSpace !== 'pre-wrap' || line.wrap !== 'normal')
      throw new Error(`${where}: expected pre-wrap and normal overflow-wrap`)
    if (line.fontSize < 12) throw new Error(`${where}: font is ${line.fontSize}px`)
    const spaces = line.text.match(/^ */)[0].length
    const expected = (spaces + 2) * line.ch
    if (
      line.indent !== `${spaces}ch` ||
      Math.abs(line.padding - expected) > 1.5 ||
      Math.abs(line.textIndent + expected) > 1.5
    )
      throw new Error(`${where}: invalid hanging indent style`)

    if (line.splitWord) throw new Error(`${where}: wraps inside a word`)
    if (
      line.clippedByAncestor ||
      line.clippedLeft ||
      (line.clippedRight && (!result.scrollable || result.obstructed))
    )
      throw new Error(`${where}: code extends beyond its visible block`)
    for (const row of line.rows.slice(1)) {
      if (Math.abs(row.left - line.rows[0].left - 2 * line.ch) > 1.5)
        throw new Error(`${where}: continuation does not hang 2ch past its indent`)
    }
  }
}
