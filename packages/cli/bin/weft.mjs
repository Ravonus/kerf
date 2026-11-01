#!/usr/bin/env node
import { main } from '../src/cli.mjs'

// Not `exitCode`: an app's module can leave a pool open, and a finished command must still end.
const code = await main(process.argv.slice(2))
// A pipe holds about 64 KB: exiting first would cut off long --json output.
await Promise.all([process.stdout, process.stderr].map(out => new Promise(done => out.write('', done))))
process.exit(code)
