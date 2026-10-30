#!/usr/bin/env node
import { main } from '../src/cli.mjs'

// Not `exitCode`: an app's module can leave a pool open, and a finished command must still end.
process.exit(await main(process.argv.slice(2)))
