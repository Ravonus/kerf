import type { MediaAsset } from './media'

/** Inline style: the box (aspect ratio), the placeholder behind a photo, the focal point. */
export function mediaStyle(
  a: MediaAsset,
  focus?: [number, number],
  fit?: 'cover' | 'contain',
): string {
  let s = `aspect-ratio:${a.width}/${a.height};max-inline-size:100%;block-size:auto`
  if (a.kind === 'photo' && (a.placeholder || a.dominant))
    s += `;background:${a.dominant ?? ''}${a.placeholder ? ` url(${a.placeholder})` : ''} center/cover no-repeat`
  if (fit) s += `;object-fit:${fit}`
  if (focus) s += `;object-position:${Math.round(focus[0] * 100)}% ${Math.round(focus[1] * 100)}%`
  return s
}
