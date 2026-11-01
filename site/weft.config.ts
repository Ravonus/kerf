import { defineConfig } from 'weft/config'
import { dialScript, warp } from '@weft/warp/plugin'
import { icons } from '@weft/icons/plugin'
import { text } from '@weft/plugin-text'

const FILES = 'node_modules/@fontsource'

export default defineConfig({
  // arena/ is its own project: the same page in React, Solid and weft, none of which may load warp or the sizes it compares change.
  check: { exclude: ['arena/**'] },
  tasks: {
    content: { run: 'node --disable-warning=ExperimentalWarning scripts/content.mjs', description: 'Generate docs, search indexes, llms.txt and numbers from the repo', sideEffects: ['fs'] },
  },
  site: {
    name: 'weft',
    title: '%s · weft',
    description: 'TSX that compiles to direct DOM bindings. Component bodies run once, and the compiler explains its errors to agents.',
    locale: 'en_US',
    head: `<script>document.documentElement.dataset.expression='vivid'</script>${dialScript}`,
  },
  plugins: [
    warp(),
    icons(),
    text({
      measure: 'off',
      fonts: {
        body: { family: 'Inter', src: `${FILES}-variable/inter/files/inter-latin-wght-normal.woff2`, fallback: 'Arial', axes: { wght: [100, 900] } },
        display: { family: 'Space Grotesk', src: `${FILES}-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2`, fallback: 'Arial', axes: { wght: [300, 700] } },
        mono: { family: 'IBM Plex Mono', src: `${FILES}/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2`, fallback: 'Courier New', weight: 400, preload: false },
        serif: { family: 'Instrument Serif', src: `${FILES}/instrument-serif/files/instrument-serif-latin-400-normal.woff2`, fallback: 'Times New Roman', weight: 400, preload: false },
        serifItalic: { family: 'Instrument Serif', src: `${FILES}/instrument-serif/files/instrument-serif-latin-400-italic.woff2`, fallback: 'Times New Roman', weight: 400, style: 'italic', preload: false },
      },
    }),
  ],
})
