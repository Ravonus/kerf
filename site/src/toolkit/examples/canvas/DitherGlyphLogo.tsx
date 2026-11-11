import { DitherGlyph } from '@kerf-js/veneer'

export const BOLT = 'M13 2 4 14h7l-1 8 9-12h-7z'

export const DitherGlyphLogo = () => (
  <DitherGlyph
    path={BOLT}
    box={[24, 24]}
    fit={0.9}
    label="kerf's bolt"
    ratio="3 / 1"
    kind="rings"
  />
)
