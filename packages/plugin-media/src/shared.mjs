// What build.mjs and server.mjs both need: the defaults, the encoder calls and the MIME table. It lives apart so the build
// can call the server for `encoder: 'server'` without the two importing each other.

/** Every option's default: the width ladder, the quality search, the placeholder, the GIF limit, the video ladder. */
export const DEFAULTS = {
  formats: ['avif'],
  widths: [320, 640, 960, 1280, 1920, 2560],
  quality: { target: 80, scorer: 'ssimulacra2' },
  placeholder: true,
  gifLimit: 256 * 1024,
  video: { codecs: ['av1'], widths: [640, 960, 1280, 1920] },
}
/** Encoder settings without a scorer. */
export const FIXED = { avif: 50, webp: 75, jpeg: 78 }
/** Content types of the formats this package writes. */
export const MIME = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  svg: 'image/svg+xml',
}

/** One sharp call per format: quality in, a configured pipeline out. PNG takes no quality. */
export const encoders = {
  avif: (img, q) => img.avif({ quality: q, effort: 4, chromaSubsampling: '4:2:0' }),
  webp: (img, q) => img.webp({ quality: q, effort: 5 }),
  jpeg: (img, q) => img.jpeg({ quality: q, mozjpeg: true }),
  png: (img) => img.png({ compressionLevel: 9, effort: 8 }),
}

/** A sharp `dominant` colour as `#rrggbb`. */
export const hex = ({ r, g, b }) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
/** Lossy sources get a lossy fallback; a WebP with alpha is a graphic. */
export const isPhoto = (meta) =>
  ['jpeg', 'jpg', 'avif', 'heif', 'tiff', 'webp'].includes(meta.format) &&
  !(meta.format === 'webp' && meta.hasAlpha)
