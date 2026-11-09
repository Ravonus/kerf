import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { calibrationChecks } from '../run/calibration-target.mjs'
import { chromium } from './browser.mjs'
import { here } from './paths.mjs'

async function runOnce(browser, base, t) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  ctx.setDefaultTimeout(5000)
  const page = await ctx.newPage()
  const problems = []
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text())
  })
  page.on('pageerror', (e) => problems.push(e.message))
  let timer
  try {
    await Promise.race([
      t.run({ page, base, problems }),
      new Promise((_, no) => {
        timer = setTimeout(() => no(new Error('test timed out')), 30_000)
      }),
    ])
    return null
  } catch (e) {
    return String(e.message)
  } finally {
    clearTimeout(timer)
    await ctx.close()
  }
}

async function runWithRerun(browser, base, t) {
  let failure = await runOnce(browser, base, t),
    flaky = false
  if (failure) {
    const again = await runOnce(browser, base, t)
    flaky = !again
    if (flaky) failure = null
  }
  return { title: t.title, ok: !failure, failure, flaky }
}

/** Run a task's hidden tests, each in a fresh browser context. A failure gets one rerun, and a flake is recorded as one. */
export async function hidden(task, base, calibration = false) {
  const module = await import(pathToFileURL(join(here, 'tasks', task, 'hidden.mjs')).href)
  const tests =
    calibration || task === 'bugfix-shop' ? calibrationChecks(task, module) : module.tests
  const browser = await chromium.launch()
  const results = []
  for (const t of tests) results.push(await runWithRerun(browser, base, t))
  await browser.close()
  return {
    passed: results.filter((r) => r.ok).length,
    total: results.length,
    flaky: results.filter((r) => r.flaky).length,
    failed: results.filter((r) => !r.ok),
  }
}
