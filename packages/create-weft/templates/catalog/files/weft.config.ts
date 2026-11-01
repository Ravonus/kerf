import { defineConfig } from 'weft/config'
import { warp } from '@weft/warp/plugin'

export default defineConfig({
  site: {
    name: 'Mendwell',
    locale: 'en_US',
    title: '%s · Mendwell',
    description: 'Mendwell sells everyday goods made to be used hard and repaired when they wear.',
    head: '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
  },
  plugins: [
    warp({
      seed: { accent: '#8a2435' },
      dials: { expression: 'balanced', density: 'comfortable' },
      radius: 'round',
      fields: 'classic',
      fonts: {
        display: '"Avenir Next", "Century Gothic", Futura, ui-sans-serif, system-ui, sans-serif',
        body: '"Avenir Next", "Segoe UI", ui-sans-serif, system-ui, sans-serif',
      },
      tokens: {
        '--warp-color-page': 'light-dark(#f7f6f3, #141213)',
        '--warp-color-surface': 'light-dark(#fdfcfa, #1d1a1b)',
        '--warp-color-surface-raised': 'light-dark(#ffffff, #231f20)',
        '--warp-color-surface-sunken': 'light-dark(#f1efea, #0e0c0d)',
      },
    }),
  ],
})
