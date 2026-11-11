// Fonts in any format the web uses, for either Takumi build. Takumi native reads TTF, OTF, WOFF and WOFF2; the wasm
// build doesn't read WOFF (1.0), and Satori never read WOFF2. So WOFF is unpacked to its SFNT here (zlib per table,
// with the platform's DecompressionStream, which Node, Bun and workerd all have), and every build gets every format.

const tag = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3])

/** 'woff' | 'woff2' | 'ttf' | 'otf' | null, from the file's magic number. */
export function fontFormat(bytes) {
  const t = tag(bytes, 0)
  if (t === 'wOFF') return 'woff'
  if (t === 'wOF2') return 'woff2'
  if (t === 'OTTO') return 'otf'
  if (t === '\0\x01\0\0' || t === 'true') return 'ttf'
  return null
}

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** WOFF 1.0 → the SFNT (TTF/OTF) it wraps (W3C WOFF 1.0 §4–5). */
export async function woffToSfnt(woff) {
  const v = new DataView(woff.buffer, woff.byteOffset, woff.byteLength)
  const numTables = v.getUint16(12)
  const tables = []
  for (let i = 0; i < numTables; i++) {
    const at = 44 + i * 20
    const offset = v.getUint32(at + 4),
      compLength = v.getUint32(at + 8),
      origLength = v.getUint32(at + 12)
    const raw = woff.subarray(offset, offset + compLength)
    tables.push({
      tag: v.getUint32(at),
      checksum: v.getUint32(at + 16),
      data: compLength < origLength ? await inflate(raw) : raw,
    })
  }
  let size = 12 + 16 * numTables
  for (const t of tables) size += (t.data.length + 3) & ~3
  const out = new Uint8Array(size)
  const w = new DataView(out.buffer)
  const log2 = Math.floor(Math.log2(numTables))
  w.setUint32(0, v.getUint32(4)) // flavor
  w.setUint16(4, numTables)
  w.setUint16(6, 16 << log2)
  w.setUint16(8, log2)
  w.setUint16(10, numTables * 16 - (16 << log2))
  let offset = 12 + 16 * numTables
  tables.forEach((t, i) => {
    const at = 12 + i * 16
    w.setUint32(at, t.tag)
    w.setUint32(at + 4, t.checksum)
    w.setUint32(at + 8, offset)
    w.setUint32(at + 12, t.data.length)
    out.set(t.data, offset)
    offset += (t.data.length + 3) & ~3
  })
  return out
}

/** `{ name, data, weight?, style? }[]` in any format → the same with bytes every Takumi build reads. */
export async function normalizeFonts(fonts) {
  return Promise.all(
    fonts.map(async (f) => {
      const data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data)
      const format = fontFormat(data)
      if (!format) throw new Error(`kerf/og: font "${f.name}" isn't TTF, OTF, WOFF or WOFF2`)
      return { ...f, data: format === 'woff' ? await woffToSfnt(data) : data }
    }),
  )
}
