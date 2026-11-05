import { defineConfig } from 'vite'
import weft from '@weft-js/core/vite'

export default defineConfig({ base: './', plugins: [weft()] })
