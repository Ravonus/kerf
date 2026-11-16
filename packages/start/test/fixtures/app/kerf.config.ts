import { defineConfig } from '@kerf-js/core/config'

export default defineConfig({
  site: {
    name: 'Acme',
    mutationOrigins: ['https://partner.example'],
    cors: { origins: ['https://partner.example'], credentials: true, headers: ['x-agorix-grant'] },
    url: 'https://acme.dev',
    title: '%s · Acme',
    description: 'Tools for builders.',
    locale: 'en_US',
    image: 'auto',
    twitter: { card: 'summary_large_image', site: '@acme' },
  },
})
