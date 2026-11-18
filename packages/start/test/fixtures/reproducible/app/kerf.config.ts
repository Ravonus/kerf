import { defineConfig } from '@kerf-js/core/config'

export default defineConfig({
  build: { audit: false },
  site: {
    name: 'Release fixture',
    image: false,
    ...(process.env.RELEASE_SHELL === '1' && { render: 'shell' }),
  },
})
