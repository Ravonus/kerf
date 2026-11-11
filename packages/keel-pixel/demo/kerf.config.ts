import { defineConfig } from '@kerf/core/config'
import { text } from '@kerf/text'
import { keelPixel } from '@kerf/keel-pixel'

export default defineConfig({ plugins: [text(), keelPixel()] })
