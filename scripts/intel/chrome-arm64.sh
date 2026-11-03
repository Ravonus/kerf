#!/bin/bash
# A child of an Intel Node would start the x86_64 half of Chrome too. The browser isn't what's being tested, so it runs
# natively: CHROME points here in scripts/intel/proof.mjs.
exec arch -arm64 "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "$@"
