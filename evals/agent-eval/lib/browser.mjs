import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { here } from './paths.mjs'

const dependencyRoot = process.env.WEFT_EVAL_DEPS ?? here
const require = createRequire(join(dependencyRoot, 'package.json'))
export const { chromium } = require('playwright-core')
export const axe = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
export const run = promisify(execFile)
