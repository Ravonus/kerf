// Every copy button on a component page must hand over code that runs. Writes each example's copied text to a file of its
// own, then has TypeScript check it against warp. An undefined name, a missing import or a stale prop fails here.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const site = new URL('..', import.meta.url).pathname
const dir = join(site, '.paste')
const pages = JSON.parse(readFileSync(join(site, 'src/generated/toolkit.json'), 'utf8'))
const text = html => html.match(/<code>([\s\S]*)<\/code>/)[1].replace(/<\/span><span data-part="line">/g, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir)
let n = 0
for (const p of Object.values(pages)) {
  for (const ex of [p.hero, ...p.sections.flatMap(s => s.examples ?? [])]) {
    if (!ex) continue
    writeFileSync(join(dir, `${p.slug}--${ex.id}.tsx`), text(ex.code))
    n++
  }
}
writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ extends: '../tsconfig.json', compilerOptions: { noEmit: true, noUnusedLocals: false, strict: false, skipLibCheck: true }, include: ['*.tsx', '../src/weft-env.d.ts'] }))
let out = ''
try { execFileSync('npx', ['tsc', '-p', dir], { cwd: site, stdio: 'pipe', maxBuffer: 1 << 28 }) } catch (e) { out = String(e.stdout) }
// What stops code running. Looser typing between a sample's data and a prop is the data's own affair.
const errors = out.split('\n').filter(l => /error TS(1\d{3}|2304|2305|2307|2448|2451|2552|2724|2503|2395|2300)\b/.test(l) && l.includes('.paste'))
if (!process.env.KEEP) rmSync(dir, { recursive: true, force: true })
console.log(`${n} examples, ${errors.length} errors`)
for (const e of errors.slice(0, Number(process.env.SHOW ?? 40))) console.log(e.replace('.paste/', ''))
process.exit(errors.length ? 1 : 0)
