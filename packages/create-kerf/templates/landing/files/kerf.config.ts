import { defineConfig } from '@kerf/core/config'
import { veneer } from '@kerf/veneer/plugin'
import { text } from '@kerf/text'
import { media } from '@kerf/media'

export default defineConfig({
  site: {
    name: 'Emberline',
    locale: 'en_US',
    title: '%s · Emberline',
    description:
      'Emberline listens to your customer calls and turns them into a ranked list of what to build next.',
    head: '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
  },
  plugins: [
    veneer({
      seed: { accent: '#c2410c' },
      dials: { expression: 'vivid' },
      radius: 'round',
      fonts: {
        display: '"Figtree", "Figtree Fallback", ui-sans-serif, system-ui, sans-serif',
        body: '"Figtree", "Figtree Fallback", ui-sans-serif, system-ui, sans-serif',
      },
      tokens: {
        '--veneer-color-page': 'light-dark(#f8f1e4, #1d1613)',
        '--veneer-color-surface': 'light-dark(#fdf8ee, #261d19)',
        '--veneer-color-surface-raised': 'light-dark(#fffcf5, #281e1a)',
        '--veneer-color-surface-sunken': 'light-dark(#f5eee0, #171110)',
      },
    }),
    text({
      measure: 'off',
      fonts: {
        body: {
          family: 'Figtree',
          src: 'assets/fonts/figtree.woff2',
          fallback: 'Arial',
          axes: { wght: [300, 900] },
        },
      },
    }),
    media(),
  ],
})
