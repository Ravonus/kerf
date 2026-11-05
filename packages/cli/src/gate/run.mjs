import { runVitest, vitestBin } from '../workspace.mjs'
import { afterRun } from './after.mjs'
import { beforeRun } from './before.mjs'
import { mutate } from './mutation.mjs'

export async function runGate({
  root,
  options,
  cases,
  testFiles,
  log,
  result,
  source,
  allowed,
  diagnostics,
  importsOf,
  code,
  posix,
  isSupport,
  maxMutants,
  concurrency,
  budgetSec,
  started,
  compileError,
}) {
  const bin = vitestBin(root)
  const run = (dir, files) =>
    runVitest(dir, files, { bin, config: options.config, timeoutMs: 180_000 })

  const { after, resolveCases, byKey } = await afterRun({
    cases,
    testFiles,
    log,
    root,
    options,
    run,
    result,
  })
  await beforeRun({
    source,
    options,
    log,
    root,
    run,
    testFiles,
    resolveCases,
    byKey,
    allowed,
    result,
    diagnostics,
  })

  await mutate({
    options,
    root,
    source,
    testFiles,
    importsOf,
    code,
    posix,
    isSupport,
    maxMutants,
    byKey,
    result,
    log,
    concurrency,
    budgetSec,
    started,
    after,
    bin,
    compileError,
    allowed,
    diagnostics,
  })
}
