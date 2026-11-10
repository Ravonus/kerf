// Wheel events into pixels, and which kind of device sent them: a notched wheel animates each step, a trackpad's
// pixel deltas (already carrying the OS's own momentum) apply as they come.

/** One wheel event, normalised. */
export interface WheelStep {
  x: number
  y: number
  /** A mouse wheel's notch, not a trackpad: animate it. */
  notched: boolean
}

/** Pixels for a wheel event. `line` px per line; a page is `page` px (the viewport less a little overlap). */
export function normalizeWheel(
  e: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode' | 'shiftKey'> & { wheelDeltaY?: number },
  line: number,
  page: { x: number; y: number },
): WheelStep {
  const scale = e.deltaMode === 1 ? line : 1
  let x = e.deltaMode === 2 ? e.deltaX * page.x : e.deltaX * scale
  let y = e.deltaMode === 2 ? e.deltaY * page.y : e.deltaY * scale
  const raw = e.wheelDeltaY ?? 0
  const notched = e.deltaMode !== 0 || (raw !== 0 && Math.abs(raw) % 120 === 0 && Math.abs(y) >= 50)
  // Windows and Linux send Shift+wheel as vertical; macOS has already swapped it, so deltaX is set there.
  if (e.shiftKey && !x && y) {
    x = y
    y = 0
  }
  return { x, y, notched }
}

/** The page step for a viewport of `size` px, as browsers size Page Down: most of a screen, keeping some context. */
export const pageStep = (size: number) => Math.max(size * 0.875, size - 40)
