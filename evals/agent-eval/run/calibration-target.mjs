// Calibrate only checked-in task references and their named mutations.
import { readFileSync } from 'node:fs'

export function calibrationTarget(input) {
  const args = ['reference', 'mutant'].includes(input[0]) ? ['medium-shop', ...input] : input
  const [task, kind, name] = args
  if (!['medium-shop', 'edit-shop', 'bugfix-shop'].includes(task))
    throw new Error('unknown calibration task')
  if (kind === 'reference' && args.length === 2) return { task, mutant: null }
  if (kind !== 'mutant' || args.length !== 3)
    throw new Error('expected TASK reference or TASK mutant NAME')
  const mutants = JSON.parse(
    readFileSync(new URL(`../tasks/${task}/mutants.json`, import.meta.url)),
  )
  const mutant = mutants.find((entry) => entry.name === name)
  if (!mutant) throw new Error(`unknown ${task} mutant`)
  return { task, mutant }
}

// Fail closed if calibration would exercise a partial suite.
export function calibrationChecks(task, module) {
  const counts = { 'medium-shop': 12, 'edit-shop': 17, 'bugfix-shop': 14 }
  if (!Object.hasOwn(counts, task)) throw new Error('unknown calibration task')
  const checks = task === 'bugfix-shop' ? module.calibrationTests : module.tests
  if (!Array.isArray(checks) || checks.length !== counts[task])
    throw new Error(`invalid ${task} calibration check count`)
  return checks
}
