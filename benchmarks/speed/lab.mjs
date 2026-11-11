// The speed lab: what each path in packages/core/src/flags.ts buys and costs. It builds one app per combination of
// paths, sizes the four bundles, runs them through measure.mjs against Solid, and writes lab.json and lab.html.
//   node lab.mjs                     all on, all off, and each path off alone
//   node lab.mjs --off SWAP,TEXT     that combination against all on
//   node lab.mjs --flags SWAP,TEXT   each of those off alone
//   options: --sizes (no timing)  --report (lab.json to lab.html only)  --rounds 2  --no-reactive
//            --base <copy of packages/core>  the "before" column  --host <ssh host>  time it on another machine
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from './lab-page.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = join(here, '../../packages/core')
const argv = process.argv.slice(2)
const has = (name) => argv.includes(`--${name}`)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : fallback
}
const file = join(here, 'lab.json')
const page = join(here, 'lab.html')
const all = [
  ...readFileSync(join(pkg, 'src/flags.ts'), 'utf8').matchAll(
    /\/\*\* (.+?) \*\/\nexport const (\w+) = true/g,
  ),
].map((m) => ({ name: m[2], says: m[1] }))
const BUNDLES = {
  'hello world': 'hello',
  counter: 'counter',
  'v3 shop app': 'shop',
  'js-framework-benchmark': 'benchmark app',
}

if (has('report')) {
  writeFileSync(page, render(JSON.parse(readFileSync(file, 'utf8'))))
  console.log(`wrote ${page}`)
  process.exit(0)
}

const combo = arg('off')?.split(',')
const variants = combo
  ? [
      { id: 'on', off: [] },
      { id: `off-${combo.join('-')}`, off: combo, says: 'this combination' },
    ]
  : [
      { id: 'on', off: [] },
      ...(arg('flags') ? [] : [{ id: 'off-all', off: ['all'], says: 'every path off' }]),
      ...all
        .filter((f) => !arg('flags') || arg('flags').split(',').includes(f.name))
        .map((f) => ({ id: `off-${f.name}`, off: [f.name], says: f.says })),
    ]

const run = (cmd, args, env = {}, cwd = here) =>
  execFileSync(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })

/** One build per variant; the bundles' sizes come from the same `KERF_OFF` the suite runs with. */
const sizes = {}
for (const v of variants) {
  const env = { KERF_OFF: v.off.join(','), ONLY: Object.keys(BUNDLES).join(',') }
  const json = join(here, 'dist/.size.json')
  run(process.execPath, [join(pkg, 'scripts/size.mjs'), '--json', json], env, pkg)
  const rows = JSON.parse(readFileSync(json, 'utf8'))
  sizes[v.id] = Object.fromEntries(
    Object.entries(BUNDLES).map(([k, label]) => [label, rows[k].brBytes]),
  )
  console.log(v.id, sizes[v.id])
}

let timed = null
if (!has('sizes')) {
  run(process.execPath, ['build.mjs'])
  for (const v of variants)
    if (v.id !== 'on')
      run(process.execPath, ['build.mjs'], { NAME: v.id, KERF_OFF: v.off.join(',') })
  const base = arg('base') && resolve(arg('base'))
  if (base) run(process.execPath, ['build.mjs'], { KERF: base })
  const stacks = [
    ...(base ? ['kerf-base'] : []),
    'kerf',
    ...variants.filter((v) => v.id !== 'on').map((v) => v.id),
    'solid-batch',
  ].join(',')
  const flags = [
    '--quick',
    '--rounds',
    arg('rounds', '2'),
    '--stacks',
    stacks,
    ...(has('no-reactive') ? ['--no-reactive'] : []),
  ]
  const host = arg('host')
  const out = join(here, 'dist/.lab-results.json')
  if (host) {
    const dir = 'work/kerf-lab'
    execSync(
      `ssh ${host} 'mkdir -p ${dir}' && rsync -a --delete --exclude .core dist/ ${host}:${dir}/dist/ && rsync -a measure.mjs reactive.mjs ${host}:${dir}/`,
      { cwd: here },
    )
    execSync(
      `ssh ${host} 'export PATH=/opt/homebrew/bin:$PATH; cd ${dir}; echo "{\\"type\\":\\"module\\",\\"dependencies\\":{\\"playwright-core\\":\\"1.56.1\\"}}" > package.json; npm i --no-audit --no-fund >/dev/null 2>&1; npx playwright-core install chromium-headless-shell >/dev/null 2>&1; node measure.mjs --out lab.json ${flags.join(' ')}' && scp -q ${host}:${dir}/lab.json ${out}`,
      { cwd: here, stdio: 'inherit' },
    )
  } else {
    execFileSync(process.execPath, ['measure.mjs', '--out', out, ...flags], {
      cwd: here,
      stdio: 'inherit',
    })
  }
  timed = JSON.parse(readFileSync(out, 'utf8'))
}

const lab = { flags: all, variants, sizes, timed, when: new Date().toISOString() }
writeFileSync(file, JSON.stringify(lab, null, 1) + '\n')
writeFileSync(page, render(lab))
console.log(`wrote ${page}`)
