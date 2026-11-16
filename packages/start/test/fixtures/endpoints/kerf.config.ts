import { defineConfig } from '@kerf-js/core/config'
export default defineConfig({
  site: {
    name: 'Endpoints',
    description: 'HTTP route tests.',
    image: false,
    mutationOrigins: ['https://partner.example'],
    cors: { origins: ['https://partner.example'], credentials: true, headers: ['x-agorix-grant'] },
  },
})
