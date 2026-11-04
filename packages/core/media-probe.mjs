// Image dimensions from the file header (research 26 §2.2): PNG, GIF, JPEG, WebP, AVIF/HEIF and SVG, with no
// dependency. `?media` falls back to this when no `media.build` provider is bound, so every asset still has its size.

const be16 = (b, i) => (b[i] << 8) | b[i + 1]
const be32 = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]
const le16 = (b, i) => b[i] | (b[i + 1] << 8)
const le24 = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)
const ascii = (b, i, n) => String.fromCharCode(...b.subarray(i, i + n))

/** JPEG EXIF orientations 5–8 swap width and height. */
function jpegOrientation(b, start, end) {
  if (ascii(b, start, 4) !== 'Exif') return 1
  const t = start + 6
  const le = ascii(b, t, 2) === 'II'
  const u16 = (i) => (le ? le16(b, i) : be16(b, i))
  const u32 = (i) =>
    le ? (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0 : be32(b, i)
  const ifd = t + u32(t + 4)
  if (ifd + 2 > end) return 1
  for (let n = u16(ifd), i = ifd + 2; n-- > 0 && i + 12 <= end; i += 12)
    if (u16(i) === 0x0112) return u16(i + 8)
  return 1
}

/**
 * @param {Uint8Array} b file bytes
 * @param {string} [name] file name, used for SVG detection when the bytes don't say
 * @returns {{ width: number, height: number, type: string } | undefined}
 */
export function probe(b, name = '') {
  if (b.length >= 24 && be32(b, 0) === 0x89504e47)
    return { width: be32(b, 16), height: be32(b, 20), type: 'image/png' }
  if (ascii(b, 0, 4) === 'GIF8') return { width: le16(b, 6), height: le16(b, 8), type: 'image/gif' }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let orientation = 1
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) {
        i++
        continue
      }
      const m = b[i + 1]
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
        i += 2
        continue
      }
      const len = be16(b, i + 2)
      if (m === 0xe1) orientation = jpegOrientation(b, i + 4, i + 2 + len)
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        const height = be16(b, i + 5),
          width = be16(b, i + 7)
        return orientation >= 5
          ? { width: height, height: width, type: 'image/jpeg' }
          : { width, height, type: 'image/jpeg' }
      }
      i += 2 + len
    }
    return undefined
  }
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
    const chunk = ascii(b, 12, 4)
    if (chunk === 'VP8 ')
      return { width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff, type: 'image/webp' }
    if (chunk === 'VP8L') {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, type: 'image/webp' }
    }
    if (chunk === 'VP8X')
      return { width: le24(b, 24) + 1, height: le24(b, 27) + 1, type: 'image/webp' }
    return undefined
  }
  if (ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4)
    const type = brand === 'avif' || brand === 'avis' ? 'image/avif' : 'image/heif'
    for (let i = 8; i + 16 <= Math.min(b.length, 1 << 16); i++) {
      if (b[i] === 0x69 && ascii(b, i, 4) === 'ispe')
        return { width: be32(b, i + 8), height: be32(b, i + 12), type }
    }
    return undefined
  }
  const head = new TextDecoder().decode(b.subarray(0, 4096))
  if (/\.svg$/i.test(name) || /<svg[\s>]/.test(head)) return svgSize(head)
  return undefined
}

/** `width`/`height` in px (or unitless) on the root <svg>, else the viewBox. */
function svgSize(text) {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0]
  if (!tag) return undefined
  const attr = (n) => new RegExp(`\\s${n}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1]
  const px = (v) => (v && /^\s*[\d.]+\s*(px)?\s*$/.test(v) ? parseFloat(v) : undefined)
  const box = attr('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
  let width = px(attr('width')),
    height = px(attr('height'))
  if (box?.length === 4 && box.every(Number.isFinite)) {
    if (width === undefined && height === undefined) [width, height] = [box[2], box[3]]
    else if (width === undefined) width = (height * box[2]) / box[3]
    else if (height === undefined) height = (width * box[3]) / box[2]
  }
  return width && height
    ? { width: Math.round(width), height: Math.round(height), type: 'image/svg+xml' }
    : undefined
}
