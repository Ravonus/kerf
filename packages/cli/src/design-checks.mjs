// The design D-codes in `kerf check` (PLAN §6, research 37). Two families:
//
//   D001–D007  off-system values, hand-rolled layout and role drift. Only where the app has veneer's tokens to use instead (`@kerf/veneer`
//              in package.json), so an app that chose raw Tailwind or its own CSS is left alone.
//   D011, D030–D039  contrast and accessibility, in every app.
//
// An autofix is offered only when it keeps the meaning: a length that is exactly a scale step, a tag swap, a Tailwind
// class with an exact equivalent. A raw colour never gets one, because a token follows the theme and the raw value
// didn't; the agent chooses from `expected`. `check: { design: false }` turns both families off, and
// `// kerf-allow D001: <reason>` on the line above keeps one site. Reads the JSX of the checked files and the app's .css.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeReporter } from './design-checks/reporter.mjs'
import { checkJsx } from './design-checks/jsx.mjs'
import { checkCsp } from './design-checks/csp.mjs'
import { checkFiles } from './design-checks/files.mjs'
import { roleDrift } from './design-checks/rules.mjs'

export function hasTokens(root) {
  const file = join(root, 'package.json')
  if (!existsSync(file)) return false
  try {
    const { dependencies, devDependencies } = JSON.parse(readFileSync(file, 'utf8'))
    return '@kerf/veneer' in { ...dependencies, ...devDependencies }
  } catch {
    return false
  }
}

/**
 * @param {string} root
 * @param {{ files: { rel: string, text: string }[], exclude?: string[], tokens: boolean }} options
 */
export function designChecks(root, { files: all, exclude = [], tokens }) {
  const files = all.filter((f) => !/\.og\.[jt]sx$/.test(f.rel)) // a share card is drawn to a PNG: no theme, no tokens, no reader
  const out = []
  const looks = new Map() // heading level → every site that renders it, across the app, for D006
  const reporter = makeReporter(out)

  checkJsx({ files, reporter, tokens, looks })

  for (const [level, sites] of looks) roleDrift(level, sites)

  checkCsp(root, files, reporter)

  checkFiles(root, exclude, tokens, reporter)
  return out
}
