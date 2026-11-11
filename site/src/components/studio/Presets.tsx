// Starting points for the studio, and a switch that puts the theme on the whole site while you look around.
import { onCleanup, state } from '@kerf/core'
import { Switch } from '@kerf/veneer'
import { STUDIO_PALETTE, type StudioConfig } from '../../lib/studio'
import type { Cfg } from './rows'

const PRESETS: { name: string; swatch: string; config: StudioConfig }[] = [
  { name: 'Kerf', swatch: '#2f9e6a', config: {} },
  { name: 'Ember', swatch: '#e8590c', config: { seed: { accent: '#e8590c' } } },
  {
    name: 'Ocean',
    swatch: '#0b7285',
    config: {
      seed: { accent: '#0b7285', neutral: '#5c7c8a' },
      system: { radius: { control: 8, surface: 14 } },
    },
  },
  {
    name: 'Grape',
    swatch: '#7048e8',
    config: {
      seed: { accent: '#7048e8' },
      colors: { brand: '#7048e8' },
      parts: { button: { radius: 'pill' }, chip: { radius: 'pill' } },
    },
  },
  {
    name: 'Soft',
    swatch: '#d6336c',
    config: {
      seed: { accent: '#d6336c', neutral: '#c2a5ad' },
      dials: { density: 'comfortable' },
      system: {
        radius: { control: 14, surface: 24, mark: 6 },
        font: { sans: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif' },
      },
    },
  },
  {
    name: 'Brutal',
    swatch: '#1b1b1f',
    config: {
      seed: { accent: '#1b1b1f' },
      dials: { flair: 'none' },
      system: {
        radius: { control: 0, surface: 0, mark: 0 },
        border: { hairline: 2, emphasis: 3 },
        font: { sans: 'ui-monospace, "SF Mono", Menlo, monospace' },
        text: { button: { case: 'uppercase' } },
      },
    },
  },
  {
    name: 'Midnight',
    swatch: '#4dabf7',
    config: {
      seed: { accent: '#4dabf7', neutral: '#3b4a6b' },
      dials: { theme: 'dark', expression: 'vivid' },
      system: { radius: { control: 6, surface: 10 } },
    },
  },
]

/** One click to a whole look, to tune from there. */
export function Presets(props: { cfg: Cfg }) {
  return (
    <section data-studio="presets" aria-label="Start from">
      {PRESETS.map((p) => (
        <button
          key={p.name}
          type="button"
          title={`Start from ${p.name}`}
          onClick={() => (props.cfg.value = p.config)}
        >
          <span data-studio="swatch" style={`--swatch:${p.swatch}`} aria-hidden="true"></span>
          {p.name}
        </button>
      ))}
    </section>
  )
}

/** Puts the studio's theme on this whole page, header and sidebar too; off, or leaving the page, puts it back. */
export function WearIt() {
  const on = state(false)
  const root = () => document.documentElement
  let was: string | null = null
  const set = (next: boolean) => {
    if (next === on.value) return
    if (next) {
      was = root().getAttribute('data-palette')
      root().setAttribute('data-palette', STUDIO_PALETTE)
    } else if (was === null) root().removeAttribute('data-palette')
    else root().setAttribute('data-palette', was)
    on.value = next
  }
  onCleanup(() => set(false))
  return (
    <Switch
      checked={on.value}
      onChange={(e: Event) => set((e.currentTarget as HTMLInputElement).checked)}
    >
      Wear it on this page
    </Switch>
  )
}
