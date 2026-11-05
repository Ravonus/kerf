// Only checked-in medium-shop reference and named mutations are valid targets.
import { readFileSync } from 'node:fs'

export function calibrationTarget(args) {
  if (args.length === 1 && args[0] === 'reference') return null
  if (args.length !== 2 || args[0] !== 'mutant')
    throw new Error('expected reference or mutant NAME')
  const mutants = JSON.parse(
    readFileSync(new URL('../tasks/medium-shop/mutants.json', import.meta.url)),
  )
  const mutant = mutants.find((entry) => entry.name === args[1])
  if (!mutant) throw new Error('unknown medium-shop mutant')
  return mutant
}
