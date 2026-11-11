// Contact sheets: tiles laid out on one canvas in the browser, so no image tool has to be installed.

/** Where each tile goes: `cols` columns (default near square), `label` px of caption under each, `gap` apart. */
export function sheetLayout(count, { tileWidth, tileHeight, cols, gap = 4, label = 0 }) {
  const across = Math.max(1, Math.min(count, cols ?? Math.ceil(Math.sqrt(count))))
  const rows = Math.max(1, Math.ceil(count / across))
  const cell = tileHeight + label
  return {
    width: across * tileWidth + (across + 1) * gap,
    height: rows * cell + (rows + 1) * gap,
    cells: Array.from({ length: count }, (_, i) => ({
      x: gap + (i % across) * (tileWidth + gap),
      y: gap + Math.floor(i / across) * (cell + gap),
    })),
  }
}

/** Decodes every tile in the page and reports each one's size. */
const DECODE = async (data) => {
  const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const tiles = await Promise.all(data.map((b64) => createImageBitmap(new Blob([bytes(b64)]))))
  Object.assign(globalThis, { kerfSheetTiles: tiles })
  return tiles.map((t) => ({ width: t.width, height: t.height }))
}

/** Draws the decoded tiles at their cells, with captions, and returns the sheet as base64 PNG. */
const DRAW = async (o) => {
  const tiles = Reflect.get(globalThis, 'kerfSheetTiles')
  const canvas = new OffscreenCanvas(o.layout.width, o.layout.height)
  const x = canvas.getContext('2d')
  x.fillStyle = o.background
  x.fillRect(0, 0, canvas.width, canvas.height)
  x.font = `${Math.round(o.label * 0.6)}px ui-monospace, monospace`
  x.textBaseline = 'middle'
  tiles.forEach((tile, i) => {
    const cell = o.layout.cells[i]
    if (!cell) return
    x.drawImage(tile, cell.x, cell.y, o.tileWidth, o.tileHeight)
    x.fillStyle = '#d8d8d8'
    if (o.labels[i]) x.fillText(o.labels[i], cell.x + 4, cell.y + o.tileHeight + o.label / 2)
  })
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

/** Lays PNG or JPEG tiles on one PNG sheet, each at `width` px and the first tile's aspect. */
export async function sheet(browser, tiles, options = {}) {
  if (!tiles.length) throw new Error('kerf capture: a sheet needs at least one tile')
  const page = await browser.newPage()
  try {
    const sizes = await page.evaluate(
      DECODE,
      tiles.map((t) => Buffer.from(t).toString('base64')),
    )
    const first = sizes[0]
    const tileWidth = options.width ?? Math.min(480, first.width)
    const tileHeight = Math.round((first.height / first.width) * tileWidth)
    const label = options.labels ? 20 : 0
    const { cols, gap } = options
    const layout = sheetLayout(tiles.length, { tileWidth, tileHeight, label, cols, gap })
    const background = options.background ?? '#1e1e1e'
    const labels = options.labels ?? []
    const png = await page.evaluate(DRAW, {
      layout,
      tileWidth,
      tileHeight,
      labels,
      background,
      label,
    })
    return Buffer.from(png, 'base64')
  } finally {
    await page.close()
  }
}
