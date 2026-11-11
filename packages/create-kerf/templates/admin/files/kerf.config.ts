import { defineConfig } from '@kerf-js/core/config'
import { veneer } from '@kerf-js/veneer/plugin'

export default defineConfig({
  site: {
    name: 'Backroom',
    locale: 'en_US',
    title: '%s · Backroom',
    description: 'Backroom is where you run the shop: orders, customers and revenue in one place.',
    head: '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
  },
  plugins: [
    veneer({
      seed: { accent: '#4f46e5' },
      dials: { expression: 'balanced', density: 'compact' },
      radius: 'soft',
      fields: 'classic',
      fonts: {
        display: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        body: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      },
      tokens: {
        '--veneer-color-page': 'light-dark(#eceef5, #0e1020)',
        '--veneer-color-surface': 'light-dark(#fbfbfe, #161a2e)',
        '--veneer-color-surface-raised': 'light-dark(#ffffff, #1b2036)',
        '--veneer-color-surface-sunken': 'light-dark(#f1f2f8, #0a0c18)',
      },
    }),
  ],
})
