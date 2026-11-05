#!/usr/bin/env node
// The fixture path exercises dispatch without credentials, network or an evaluation.
if (process.argv[2] === 'fixture') {
  const { fixture } = await import('./run/fixture.mjs')
  const result = await fixture(process.argv[3])
  console.log(JSON.stringify(result))
  process.exitCode = result.ok ? 0 : 1
} else if (process.argv[2] === 'calibrate') {
  const { calibrate } = await import('./run/calibrate.mjs')
  try {
    process.exitCode = await calibrate(process.argv.slice(3))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 2
  }
} else {
  await import('./legacy.mjs')
}
