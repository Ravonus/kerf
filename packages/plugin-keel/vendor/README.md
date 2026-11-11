# vendor

Built by `scripts/vendor.mjs`. Don't edit these files: change the pin and run it again.

- `lit.mjs`: keel/lit, KEEL's lit WebGL2 renderer, bundled from keel-engine af03486
  (`packages/lit`). MIT, see `LICENSE`. It ports Three.js r180 (MIT), see `NOTICE`.
- `modules/`: camera-rail, device-profile, lit-finish, look, quality, tracks, tree-growth, tree-render, voxel-dither, world-light from the keel-modules catalog at a830285. MIT, see
  `LICENSE-modules`. Each `.mjs` is the catalog's verified build, each `.d.ts` its types, and each
  `.inputs.json` the settings a host may offer (`keel-module-inputs@1`).
- `modules/` also holds band: not in the catalog yet, so built here from the
  module's readable source at its pinned keel-modules commit (`SOURCE_MODULES` in the script).

`lock.json` records every file's sha256. `test/vendor.test.ts` holds the folder to it.
