import { defineConfig } from '@kerf-js/core/config'
import { keel } from '@kerf-js/keel'
import { media } from '@kerf-js/media'

export default defineConfig({ plugins: [keel(), media()] })
