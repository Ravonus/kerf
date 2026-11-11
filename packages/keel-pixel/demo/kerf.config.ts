import { defineConfig } from '@kerf-js/core/config'
import { text } from '@kerf-js/text'
import { keelPixel } from '@kerf-js/keel-pixel'

export default defineConfig({ plugins: [text(), keelPixel()] })
