import type { Surface, SurfaceOptions } from '../canvas'
import type { Forces } from './pointer'

export function fieldPointer(
  host: HTMLElement,
  getPush: () => Forces | undefined,
  getCols: () => number,
  s: Surface,
  settings: () => SurfaceOptions,
) {
  // Pointer events reach the document even when content sits over the field, as a hero's text does.
  const place = (e: PointerEvent, fn: (x: number, y: number) => void) => {
    if (!getPush() || !s.visible()) return
    const r = host.getBoundingClientRect()
    const x = e.clientX - r.left,
      y = e.clientY - r.top
    if (x < 0 || y < 0 || x > r.width || y > r.height) return getPush()!.leave()
    const k = r.width / getCols()
    fn(x / k, y / k)
    s.invalidate()
    wake()
  }
  // A settled surface is asleep, so the first push has to start it; the draw's return value keeps it going from there.
  const wake = () => s.update(settings())
  const move = (e: PointerEvent) => place(e, (x, y) => getPush()!.move(x, y))
  const press = (e: PointerEvent) => place(e, (x, y) => getPush()!.press(x, y))
  const leave = () => {
    getPush()?.leave()
    s.invalidate()
  }
  document.addEventListener('pointermove', move, { passive: true })
  document.addEventListener('pointerdown', press, { passive: true })
  document.documentElement.addEventListener('pointerleave', leave)

  return () => {
    document.removeEventListener('pointermove', move)
    document.removeEventListener('pointerdown', press)
    document.documentElement.removeEventListener('pointerleave', leave)
  }
}
