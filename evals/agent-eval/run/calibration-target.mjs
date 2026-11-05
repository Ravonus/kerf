// Calibrate only checked-in task references and their named mutations.
import { readFileSync } from 'node:fs'

export function calibrationTarget(input) {
  const args = ['reference', 'mutant'].includes(input[0]) ? ['medium-shop', ...input] : input
  const [task, kind, name] = args
  if (!['medium-shop', 'edit-shop'].includes(task)) throw new Error('unknown calibration task')
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
