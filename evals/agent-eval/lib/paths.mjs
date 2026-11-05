// Where everything lives. Run directories sit under a neutral path: the agent's system prompt prints its cwd, so a path
// naming the project or the eval would be a hint one stack could read.
import { repoRoot } from '../../../scripts/lib/helpers.mjs'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const here = join(dirname(fileURLToPath(import.meta.url)), '..')
export const repo = repoRoot
/** Paths for the default harness or one explicitly owned staging root. */
export function evalPaths(root) {
  if (root && (!isAbsolute(root) || resolve(root) === '/'))
    throw new Error('WEFT_EVAL_ROOT must be an absolute non-root directory')
  const state = root ? join(resolve(root), 'state') : '/private/tmp/aeval'
  const projects = root ? join(resolve(root), 'projects') : '/private/tmp/projects'
  return { state, projects, goldens: join(state, 'golden'), tgz: join(state, 'tgz') }
}
export const { state, projects, goldens, tgz } = evalPaths(process.env.WEFT_EVAL_ROOT)
export const realHome = process.env.HOME
export const hostHome = process.env.WEFT_EVAL_HOST_HOME ?? realHome
export const registryPort = 4873
export const nodeBin = dirname(process.execPath)
const claudeLink = join(realHome, '.local/bin/claude')
export const claudeBin = existsSync(claudeLink)
  ? execFileSync('/usr/bin/readlink', ['-f', claudeLink], { encoding: 'utf8' }).trim()
  : claudeLink
