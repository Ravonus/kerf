// Where everything lives. Run directories sit under a neutral path: the agent's system prompt prints its cwd, so a path
// naming the project or the eval would be a hint one stack could read.
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const here = join(dirname(fileURLToPath(import.meta.url)), '..')
export const repo = join(here, '../..')
export const state = '/private/tmp/aeval' // tarballs, goldens, graded copies, raw transcripts: never visible to an agent
export const projects = '/private/tmp/projects' // one <hex>/{app,home,tmp} per run
export const goldens = join(state, 'golden')
export const tgz = join(state, 'tgz')
export const realHome = process.env.HOME
export const registryPort = 4873
export const nodeBin = dirname(process.execPath)
export const claudeBin = execFileSync('/usr/bin/readlink', ['-f', join(realHome, '.local/bin/claude')], { encoding: 'utf8' }).trim()
