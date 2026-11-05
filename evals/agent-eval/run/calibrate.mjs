// Calibrate only checked-in medium-shop code against the fixed local golden.
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import { calibrationTarget } from './calibration-target.mjs'
import { goldens, here, projects } from '../lib/paths.mjs'

export async function calibrate(args) {
  const { task, mutant } = calibrationTarget(args)
  const golden = join(goldens, 'weft-warp', 'app')
  if (!existsSync(join(golden, 'package.json')))
    throw new Error(`missing owned calibration golden: ${golden}`)
  const { gradeOnce } = await import('./grade-once.mjs')
  mkdirSync(projects, { recursive: true })
  const root = mkdtempSync(join(projects, 'calibration-'))
  const box = { root, app: join(root, 'app'), home: join(root, 'home'), tmp: join(root, 'tmp') }
  try {
    mkdirSync(box.home)
    mkdirSync(box.tmp)
    cpSync(golden, box.app, { recursive: true, dereference: false, verbatimSymlinks: true })
    const starter = join(here, 'tasks', task, 'starter/weft-warp')
    if (existsSync(starter)) cpSync(starter, box.app, { recursive: true })
    const reference = join(here, 'tasks', task, 'reference/weft-warp')
    cpSync(reference, box.app, { recursive: true })
    if (mutant) applyMutant(reference, box.app, mutant)
    const stack = JSON.parse(readFileSync(join(here, 'stacks.json'), 'utf8'))['weft-warp']
    stack.calibrationPnpm = true
    const grade = await gradeOnce(box, 'weft-warp', task, 1, false, {
      stack,
      gradeable: false,
      calibration: true,
    })
    const passed = grade.total !== null && grade.passed === grade.total
    const caught = mutant && grade.failed?.some((failure) => failure.title === mutant.mustFail)
    console.log(
      JSON.stringify({
        task,
        target: mutant?.name ?? 'reference',
        passed,
        caught: !!caught,
        grade,
      }),
    )
    if (!mutant) return passed ? 0 : 1
    return caught ? 1 : 2
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(`${root}-grade1`, { recursive: true, force: true })
  }
}

function applyMutant(source, target, mutant) {
  let hits = 0
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(path)
        continue
      }
      const text = readFileSync(path, 'utf8')
      const matches = text.split(mutant.find).length - 1
      if (matches) {
        hits += matches
        writeFileSync(
          join(target, relative(source, path)),
          text.replaceAll(mutant.find, mutant.replace),
        )
      }
    }
  }
  walk(source)
  if (hits !== 1) throw new Error(`mutant target count: ${hits}`)
}
