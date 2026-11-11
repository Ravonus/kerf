import { defineConfig } from '@weft-js/core/config'
import { keel } from '@weft-js/plugin-keel'
import { media } from '@weft-js/plugin-media'

export default defineConfig({ plugins: [keel(), media()] })
