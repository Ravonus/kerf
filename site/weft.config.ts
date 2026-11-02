import { defineConfig } from '@weft-js/core/config'
import { dialScript, warp } from '@weft-js/warp/plugin'
import { icons } from '@weft-js/warp-icons/plugin'
import { text } from '@weft-js/text'

const FILES = 'node_modules/@fontsource'
// Cross-origin isolation gives the arena's frames a finer clock, and a frame only has it when the page around it does too.
const ISOLATED = { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'credentialless' }

export default defineConfig({
  // arena/ is its own project: the same page in React, Solid and weft, none of which may load warp or the sizes it compares change.
  check: { exclude: ['arena/**'] },
  tasks: {
    content: { run: 'node --disable-warning=ExperimentalWarning scripts/content.mjs', description: 'Generate docs, search indexes, llms.txt and numbers from the repo', sideEffects: ['fs'] },
  },
  site: {
    name: 'weft',
    headers: { '/': ISOLATED, '/arena/**': ISOLATED },
    ...(process.env.WEFT_SITE_URL === undefined ? {} : { url: process.env.WEFT_SITE_URL }),
    title: '%s · weft',
    description: 'TSX that compiles to direct DOM bindings. Component bodies run once, and the compiler explains its errors to agents.',
    locale: 'en_US',
    head: `<link rel="icon" href="/favicon.svg" type="image/svg+xml"><script>document.documentElement.dataset.expression='vivid'</script>${dialScript}`,
  },
  plugins: [
    warp(),
    icons(),
    text({
      measure: 'off',
      fonts: {
        body: { family: 'Inter', src: `${FILES}-variable/inter/files/inter-latin-wght-normal.woff2`, fallback: 'Arial', preload: false, axes: { wght: [100, 900] } },
        display: { family: 'Space Grotesk', src: `${FILES}-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2`, fallback: 'Arial', axes: { wght: [300, 700] } },
        mono: { family: 'IBM Plex Mono', src: `${FILES}/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2`, fallback: 'Courier New', weight: 400, preload: false },
        serif: { family: 'Instrument Serif', src: `${FILES}/instrument-serif/files/instrument-serif-latin-400-normal.woff2`, fallback: 'Times New Roman', weight: 400, preload: false },
        serifItalic: { family: 'Instrument Serif', src: `${FILES}/instrument-serif/files/instrument-serif-latin-400-italic.woff2`, fallback: 'Times New Roman', weight: 400, style: 'italic', preload: false },
      },
    }),
  ],
})
