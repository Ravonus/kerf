// WCAG contrast of two colours as the page draws them.

let ink: CanvasRenderingContext2D | null | undefined
/** A computed CSS colour as sRGB 0–1, read through a canvas so oklch() and light-dark() resolve as the page does. */
function rgb(color: string): [number, number, number] {
  ink ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!ink) return [0, 0, 0]
  ink.clearRect(0, 0, 1, 1)
  ink.fillStyle = color
  ink.fillRect(0, 0, 1, 1)
  const [r, g, b] = ink.getImageData(0, 0, 1, 1).data
  return [r! / 255, g! / 255, b! / 255]
}
const lum = (c: [number, number, number]) => {
  const [r, g, b] = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
/** WCAG contrast of two CSS colours. */
export function ratio(fg: string, bg: string) {
  const [a, b] = [lum(rgb(fg)), lum(rgb(bg))]
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
