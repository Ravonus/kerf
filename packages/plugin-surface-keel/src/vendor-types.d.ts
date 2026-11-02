/** A KEEL theme's colours: ramps of packed RGB, as the vendored engine computes them. */
export interface Palette {
  tone: string
  surface: number[]
  ink: number[]
  accent: number[]
  good: number[]
  warn: number[]
  bad: number[]
  team: unknown[]
  outline: number
  onAccent: number
  hues: { surface: number; accent: number }
}

/** KEEL's renderer, typed as far as a surface drives one. The rest of the vendored API is reachable, untyped. */
export interface PixelRenderer {
  setPalette(colours: number[][], ramps: Record<string, number[]>): void
  setMaterials(materials: { ramp: string }[]): void
  setWorld(world: object): void
  setStyle(style: object): void
  render(view: object): void
  [other: string]: unknown
}
