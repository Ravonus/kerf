import { defineConfig } from '@kerf-js/core/config'
import { text } from '@kerf-js/text'
import { keel } from '@kerf-js/keel-pixel'

export default defineConfig({ plugins: [text(), keel()] })
