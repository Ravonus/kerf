// Check that package folder names match their published names.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export function packageProblems(root, packages) {
  const problems = []
  for (const dir of packages) {
    const { name } = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'))
    const expected = typeof name === 'string' ? name.split('/').at(-1) : ''
    if (!expected || dir !== `packages/${expected}`)
      problems.push(`${dir}: package name ${name} requires packages/${expected}`)
  }
  return problems
}
