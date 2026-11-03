// M001–M013 through `weft check` (the plugin's check hook, research 26 §2.5), on a small project with planted cases.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { check } from '../../cli/src/check.mjs'

const tmp = fileURLToPath(new URL('./.tmp/', import.meta.url))
const plugin = fileURLToPath(new URL('../src/index.mjs', import.meta.url))
let root

const png = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: '#468' } }).png().toBuffer()

beforeAll(async () => {
  mkdirSync(tmp, { recursive: true })
  root = mkdtempSync(join(tmp, 'm-'))
  const files = {
    'package.json': '{ "name": "m", "private": true }',
    'weft.config.ts': `import { defineConfig } from '@weft-js/core/config'\nimport { media } from '${plugin}'\nexport default defineConfig({ plugins: [media()] })\n`,
    'src/routes/index.tsx': `import { Media } from '@weft-js/core/media'
import hero from './hero.png?media'
import raw from './big.png?url'
import evil from './evil.svg'
export default function Home() {
  return (
    <main>
      <img src={raw} alt="Wide shot" loading="lazy" />
      <img src={raw} alt="big" width={100} height={60} />
      <Media src={hero} alt="" />
      <Media src={hero} alt="Studio at night" priority />
      <Media src={hero} alt="Studio at night" priority width="1/2" />
      <Media src={hero} alt="Studio at night" priority width="1/2" loading="lazy" />
      <img src="/logo.png" alt="Logo" width={10} height={10} />
      <img src={evil} alt="Badge" width={10} height={10} />
      <video src="/clip.mp4" autoplay loop width={320} height={180} />
      <img alt="Spinner" src="./spin.gif" width={10} height={10} />
    </main>
  )
}
`,
    'src/Card.tsx': `import { Media } from '@weft-js/core/media'\nimport pic from './hero.png?media'\nexport function Card() { return <figure><Media src={pic} alt="hero" /><Media src={pic} alt="" decorative /></figure> }\n`,
    'src/routes/evil.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><foreignObject/></svg>',
  }
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
  writeFileSync(join(root, 'src/routes/big.png'), await png(1600, 900))
  writeFileSync(join(root, 'src/routes/hero.png'), await png(800, 600))
  writeFileSync(join(root, 'src/routes/spin.gif'), await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } }).gif().toBuffer())
  cpSync(join(root, 'src/routes/hero.png'), join(root, 'src/hero.png'))
  mkdirSync(join(root, 'public'))
  writeFileSync(join(root, 'public/logo.png'), await png(10, 10))
})
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

it('reports each M-code once where it applies, owned by the plugin, with fixes', async () => {
  const r = await check(root)
  const m = r.diagnostics.filter(d => d.code.startsWith('M'))
  const lines = m.map(d => `${d.file}:${d.span[0]} ${d.code}`).sort()
  expect(lines).toEqual([
    'src/Card.tsx:3 M007', // alt equals the file name
    'src/routes/index.tsx:10 M007', // alt="" without decorative
    'src/routes/index.tsx:11 M010', // priority, no width or sizes
    'src/routes/index.tsx:13 M008', // priority + lazy
    'src/routes/index.tsx:13 M009', // the third priority
    'src/routes/index.tsx:14 M013', // public/ by string
    'src/routes/index.tsx:15 M002', // a plain image import is the untouched file
    'src/routes/index.tsx:15 M012', // unsafe SVG
    'src/routes/index.tsx:16 M005', // autoplay without muted
    'src/routes/index.tsx:16 M006', // no poster
    'src/routes/index.tsx:16 M011', // endless loop, no controls
    'src/routes/index.tsx:17 M002', // a project file by string
    'src/routes/index.tsx:17 M011', // GIF in a raw img
    'src/routes/index.tsx:8 M001', // no size
    'src/routes/index.tsx:8 M002', // ?url
    'src/routes/index.tsx:8 M008', // the route's first media is lazy
    'src/routes/index.tsx:9 M002',
    'src/routes/index.tsx:9 M003', // 1600 px file in a 100 px slot
    'src/routes/index.tsx:9 M007', // alt="big" is the import's name
  ])
  for (const d of m) expect(d.owner).toBe('@weft-js/plugin-media')

  const text = readFileSync(join(root, 'src/routes/index.tsx'), 'utf8')
  const apply = d => text.slice(0, d.fix.edits[0].offset[0]) + d.fix.edits[0].text + text.slice(d.fix.edits[0].offset[1])
  const m001 = m.find(d => d.code === 'M001')
  expect(m001.fix.safe).toBe(true)
  expect(apply(m001)).toContain('<img width={1600} height={900} src={raw} alt="Wide shot" loading="lazy" />')
  expect(apply(m.find(d => d.code === 'M005'))).toContain('<video muted src="/clip.mp4"')
  expect(apply(m.find(d => d.code === 'M009'))).toContain('<Media src={hero} alt="Studio at night" width="1/2" loading="lazy" />')
  expect(apply(m.find(d => d.code === 'M002'))).toContain("import raw from './big.png?media'")
  expect(m.find(d => d.code === 'M010').fix.text).toContain('`width="1/2"`') // the catalog's fix text
})
