// Writes out/preview.<card>.html (previewHtml) next to out/<card>.card.png, to compare a browser against the renderer
// (serve out/ and open the page at a 1200×630 viewport). The previews are git-ignored: they inline fonts and images.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCardRenderer, previewHtml } from './index.mjs'
import { native } from './native.mjs'
import { defaultCard, avatarCard, stressCard } from '../build/cards.mjs'
import { props } from '../renderers.mjs'

const here = join(dirname(fileURLToPath(import.meta.url)), '..')
const bytes = (p) => new Uint8Array(readFileSync(join(here, p)))
const font = (dir, file, weight, style) => ({
  name: dir === 'inter' ? 'Inter' : 'Lora',
  data: bytes(`node_modules/@fontsource/${dir}/files/${file}`),
  weight,
  style,
})
const fonts = [
  font('inter', 'inter-latin-400-normal.woff', 400, 'normal'),
  font('inter', 'inter-latin-700-normal.woff', 700, 'normal'),
  font('lora', 'lora-latin-400-italic.woff', 400, 'italic'),
]
const avatar = `data:image/jpeg;base64,${Buffer.from(bytes('assets/avatar.jpg')).toString('base64')}`
const card = await createCardRenderer({ backend: await native(), fonts })
for (const [name, html] of Object.entries({
  default: defaultCard(props.default),
  avatar: avatarCard({ ...props.avatar, avatar }),
  stress: stressCard(props.stress),
})) {
  writeFileSync(join(here, 'out', `${name}.card.png`), (await card.render(html)).body)
  writeFileSync(join(here, 'out', `preview.${name}.html`), previewHtml(html, { fonts }))
}
