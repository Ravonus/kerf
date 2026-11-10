// Pads the full runtime to exactly 13,691 B of brotli (13.37 KB in size.mjs) with src/egg.ts, then checks that it did.
// Run it last, after any merge: everything else in the runtime moves this number.
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const target = 13691
const json = join(here, '.egg-size.json')
const file = join(here, '../src/egg.ts')

/**
 * The first n digits of π after "3.", by Machin's formula in BigInt. Digits are padding anyone can check (and
 * brotli can't shrink them much), unlike random bytes, which read like an obfuscated payload in an audit.
 */
const pi = (n) => {
  const scale = 10n ** BigInt(n + 10)
  const arctan = (x) => {
    let sum = 0n
    let term = scale / x
    const x2 = x * x
    for (let k = 1n; term !== 0n; k += 2n) {
      sum += ((k - 1n) / 2n) % 2n ? -term / k : term / k
      term /= x2
    }
    return sum
  }
  return (4n * (4n * arctan(5n) - arctan(239n))).toString().slice(1, n + 1)
}
const write = (n) =>
  writeFileSync(
    file,
    `/**
 * Not code: the digits of π after "3.", ${n} of them. The owner likes 13.37 KB, and this pads the full runtime to it
 * (scripts/egg.mjs writes it). Nothing reads this export, so no app ships it and it does nothing at runtime.
 */
export const egg =
  '${pi(n)}'
`,
  )
const measure = (n) => {
  write(n)
  try {
    execFileSync(process.execPath, [join(here, 'size.mjs'), '--json', json], {
      env: { ...process.env, ONLY: 'runtime (every export)' },
      stdio: 'ignore',
    })
  } catch {} // over the cap fails the run, and that's what this is looking for
  return JSON.parse(readFileSync(json, 'utf8'))['runtime (every export)'].brBytes
}

let lo = 0,
  hi = 16000
while (lo < hi) {
  const mid = (lo + hi + 1) >> 1
  if (measure(mid) <= target) lo = mid
  else hi = mid - 1
}
// Brotli isn't quite steady, so the search can stop a few bytes short: try the lengths around it.
let got = measure(lo)
for (let n = lo - 40; n <= lo + 40 && got !== target; n++) {
  const b = measure(n)
  if (b <= target && b > got) {
    got = b
    lo = n
  }
}
got = measure(lo)
rmSync(json, { force: true })
console.log(`egg: ${lo} characters, runtime ${got} B, ${(got / 1024).toFixed(2)} KB`)
