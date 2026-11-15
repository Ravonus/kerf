// Predict only the next small cohort: a fast scroll must not request every item it passes.
/** One artwork's document-space bounds and the visible share it needs to autoplay. */
export interface MediaViewportBox {
  top: number
  bottom: number
  left: number
  right: number
  minimumVisible: number
}
/** Current scroll position, speed in px/ms, and an optional known scrollbar destination. */
export interface MediaViewportMotion {
  y: number
  velocity: number
  direction: number
  height: number
  width: number
  target?: number | undefined
  slow?: boolean | undefined
  speculate?: boolean | undefined
}
/** Preparation attaches a source; anticipation may start muted playback shortly before entry. */
export interface MediaViewportState {
  visible: boolean
  intersecting: boolean
  preparing: boolean
  anticipating: boolean
}
/** Bound the preparation horizon by speed and screen size, including a known scrollbar destination. */
export function mediaViewportPlan(boxes: MediaViewportBox[], m: MediaViewportMotion) {
  const direction = m.direction || 1
  const focus = m.target ?? m.y
  const lead = Math.min(
    m.height * (m.slow ? 0.75 : 2),
    Math.max(m.height * 0.6, Math.abs(m.velocity) * 1000),
  )
  const imminent = Math.min(m.height * 0.75, Math.max(90, Math.abs(m.velocity) * 180))
  const distances = boxes.map((b) =>
    direction > 0 ? Math.max(0, b.top - focus - m.height) : Math.max(0, focus - b.bottom),
  )
  const result: MediaViewportState[] = boxes.map((b) => {
    const w = Math.max(0, Math.min(b.right, m.width) - Math.max(0, b.left))
    const h = Math.max(0, Math.min(b.bottom, m.y + m.height) - Math.max(m.y, b.top))
    const fraction =
      (w * h) /
      Math.max(1, Math.min(b.right - b.left, m.width) * Math.min(b.bottom - b.top, m.height))
    return {
      visible: fraction >= b.minimumVisible && w * h > 0,
      intersecting: w * h > 0,
      preparing: false,
      anticipating: false,
    }
  })
  const candidates = boxes
    .map((b, i) => ({ b, i }))
    .filter(
      ({ b, i }) =>
        !result[i]!.visible &&
        m.speculate !== false &&
        b.right > 0 &&
        b.left < m.width &&
        distances[i]! <= lead &&
        ((m.target !== undefined && b.bottom > focus && b.top < focus + m.height) ||
          (direction > 0 ? b.bottom > focus + m.height : b.top < focus)),
    )
    .sort((a, b) => distances[a.i]! - distances[b.i]!)
    .slice(0, m.slow ? 1 : 2)
  for (const { b, i } of candidates) {
    const state = result[i]!
    const gap = direction > 0 ? b.top - m.y - m.height : m.y - b.bottom
    state.preparing = true
    state.anticipating = gap >= -m.height && gap <= imminent
  }
  return result
}
