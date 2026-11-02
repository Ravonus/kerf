import { defineConfig } from '@weft-js/core/config'
import { text } from '@weft-js/text'
import { keel } from '@weft-js/plugin-surface-keel'

export default defineConfig({ plugins: [text(), keel()] })
