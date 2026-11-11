// The site's named themes: veneer({ themes }) in kerf.config.ts builds them, and the Appearance menu and each example
// frame's palette button switch them (data-palette). The first, "kerf", is the default look and sets nothing.

/** A theme the site ships: its name, label, swatch, and the `veneer({ themes })` entry. */
export const PALETTES = [
  { name: 'kerf', label: 'Kerf', swatch: '#2f9e6a' },
  {
    name: 'ember',
    label: 'Ember',
    swatch: '#e8590c',
    theme: { seed: { accent: '#e8590c' }, colors: { brand: '#e8590c' } },
  },
  {
    name: 'ocean',
    label: 'Ocean',
    swatch: '#0b7285',
    theme: { seed: { accent: '#0b7285' }, colors: { brand: '#0b7285' } },
  },
  {
    name: 'grape',
    label: 'Grape',
    swatch: '#7048e8',
    theme: { seed: { accent: '#7048e8' }, colors: { brand: '#7048e8' } },
  },
] as const

/** The names, in order, for cycling through them. */
export const PALETTE_NAMES: string[] = PALETTES.map((p) => p.name)
