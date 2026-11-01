import { defineConfig } from 'weft/config'
import { warp } from '@weft/warp/plugin'

export default defineConfig({
  site: {
    name: 'Daybook',
    locale: 'en_US',
    title: '%s · Daybook',
    description: 'Daybook is a plain, private list of what you mean to get done.',
    head: '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
  },
  plugins: [
    warp({
      seed: { accent: '#1f6f5c' },
      dials: { expression: 'quiet', density: 'cozy' },
      radius: 'sharp',
      fields: 'classic',
      fonts: {
        display: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
        body: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      },
      tokens: {
        '--warp-color-page': 'light-dark(#f2f4ef, #121815)',
        '--warp-color-surface': 'light-dark(#f9faf7, #18201c)',
        '--warp-color-surface-raised': 'light-dark(#fcfdfb, #1a221f)',
        '--warp-color-surface-sunken': 'light-dark(#eef1eb, #0e1311)',
      },
    }),
  ],
})
