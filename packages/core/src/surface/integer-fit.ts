/** Keel's integerFit: the largest whole scale of `width`×`height` that fits, never under 1. */
export function integerFit(
  width: number,
  height: number,
  availableWidth: number,
  availableHeight: number,
) {
  const scale = Math.max(1, Math.floor(Math.min(availableWidth / width, availableHeight / height)))
  return {
    scale,
    width: width * scale,
    height: height * scale,
    overflow: width > availableWidth || height > availableHeight,
  }
}
