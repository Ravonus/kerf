// Pads the full runtime to exactly 13,691 B of brotli (13.37 KB in size.mjs) with src/egg.ts, then checks that it did.
// Run it last, after any merge: everything else in the runtime moves this number.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const target = 13691
const json = join(here, '.egg-size.json')
const file = join(here, '../src/egg.ts')

/** Noise: brotli can't shrink it much, so a length maps steadily to bytes. The same length gives the same text. */
const noise = n => {
  let out = ''
  for (let i = 0; out.length < n; i++) out += createHash('sha256').update(`weft ${i}`).digest('base64url')
  return out.slice(0, n)
}
const write = n => writeFileSync(file, `// Not code. The owner likes 13.37 KB, and this pads the full runtime to it (scripts/egg.mjs). It's an export nothing
// reads, so no app ships it and it does nothing at runtime.
export const egg = '${noise(n)}'
`)
const measure = n => {
  write(n)
  try {
    execFileSync(process.execPath, [join(here, 'size.mjs'), '--json', json], { env: { ...process.env, ONLY: 'runtime (every export)' }, stdio: 'ignore' })
  } catch {} // over the cap fails the run, and that's what this is looking for
  return JSON.parse(readFileSync(json, 'utf8'))['runtime (every export)'].brBytes
}

let lo = 0, hi = 8000
while (lo < hi) {
  const mid = (lo + hi + 1) >> 1
  if (measure(mid) <= target) lo = mid
  else hi = mid - 1
}
// Brotli isn't quite steady, so the search can stop a few bytes short: try the lengths around it.
let got = measure(lo)
for (let n = lo - 40; n <= lo + 40 && got !== target; n++) {
  const b = measure(n)
  if (b <= target && b > got) { got = b; lo = n }
}
got = measure(lo)
rmSync(json, { force: true })
console.log(`egg: ${lo} characters, runtime ${got} B, ${(got / 1024).toFixed(2)} KB`)
