#!/usr/bin/env node
// The fixture path exercises dispatch without credentials, network or an evaluation.
if (process.argv[2] === 'fixture') {
  const { fixture } = await import('./run/fixture.mjs')
  const result = await fixture(process.argv[3])
  console.log(JSON.stringify(result))
  process.exitCode = result.ok ? 0 : 1
} else {
  await import('./legacy.mjs')
}
