// renderCard's cost over plain Takumi: `node card/bench.mjs` / `bun card/bench.mjs`. Warm p50/p95 over 100 renders
// of each spike card, the avatar as a data URI so no fetch is timed.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCardRenderer } from './index.mjs'
import { native } from './native.mjs'
import { wasm } from './wasm.mjs'
import { defaultCard, avatarCard } from '../build/cards.mjs'
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
const cards = {
  default: () => defaultCard(props.default),
  avatar: () => avatarCard({ ...props.avatar, avatar }),
}
const runtime = typeof Bun !== 'undefined' ? `bun ${Bun.version}` : `node ${process.versions.node}`

for (const backend of [
  await native(),
  await wasm(bytes('node_modules/@takumi-rs/wasm/pkg/takumi_wasm_bg.wasm')),
]) {
  const t0 = performance.now()
  const card = await createCardRenderer({ backend, fonts })
  const first = await card.render(cards.default())
  const out = {
    runtime,
    backend: backend.name,
    setupAndFirstMs: +(performance.now() - t0).toFixed(1),
    diagnostics: first.diagnostics.length,
  }
  for (const [name, html] of Object.entries(cards)) {
    const xs = []
    for (let i = 0; i < 100; i++) {
      const s = performance.now()
      await card.render(html())
      xs.push(performance.now() - s)
    }
    xs.sort((a, b) => a - b)
    out[name] = `${xs[50].toFixed(1)} / ${xs[95].toFixed(1)}`
  }
  console.log(JSON.stringify(out))
}
