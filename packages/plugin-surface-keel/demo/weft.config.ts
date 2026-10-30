import { defineConfig } from 'weft/config'
import { text } from '@weft/plugin-text'
import { keel } from '@weft/plugin-surface-keel'

export default defineConfig({ plugins: [text(), keel()] })
