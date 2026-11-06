# Large live calibration status

This task stays disabled. The three prepared browser checks are not connected to
`hidden.mjs`. The remaining requirements, canonical reference and semantic
mutants are listed in `coverage.json`; those checks do not prove the behavior.

A reference needs a server runtime, a database with Better Auth's tables and
server session context, and the weft realtime service. The existing weft-warp
golden uses `--db none`, so a clean calibration golden must add a supported
database and auth setup and apply its schema before grading. Use a fresh owned
database and disposable generated session secret; do not copy an owner's data
or credentials. The server must authorize writes and refuse cross-origin writes.
The app may use an ephemeral database because the specification allows data to
be lost at restart.

After the reference, controls and task-specific runner setup exist, M4 can use
the command below on the combined checkout. The current script rejects this
task: it still needs an explicit allowlist, exact check and mutant counts, and
an owned database setup and cleanup. Do not run it as evidence before that work.

```sh
WEFT_T06_TASK=large-live \
WEFT_T06_PNPM_ENTRY="$HOME/.cache/node/corepack/v1/pnpm/12.15.0/bin/pnpm.mjs" \
  bash "$HOME/work/weft-S5-verify/repo/evals/agent-eval/evidence/T06/yuna-calibrate.sh"
```

## Prepared reference setup

`reference/weft-warp` contains source based on the SQLite/auth scaffold. It
uses the single-server memory bus and native Node SQLite. `reference/dependencies.json`
records the exact additional scaffold dependencies. Use a fresh owned app with
the existing weft-warp scaffold and packed-current weft packages, preserve its
`pnpm-workspace.yaml` with `minimumReleaseAge: 4320` and existing packed-package
overrides, then copy the reference files into it. Merge the pinned dependencies
into its package manifest, including the packed-current multiplayer package,
and run pnpm 12.15.0 install without changing the policy. Generate migrations
with `pnpm exec weft db generate` before building. Set `DATABASE_URL` to a fresh
owned SQLite path and set `BETTER_AUTH_SECRET` to a disposable random secret of
at least 32 characters; set `BETTER_AUTH_URL` to the actual listener origin.
Do not commit the generated `.env`, database, migrations from another app, or
credentials. This setup and the reference have not yet been built or run.

For an owned app directory and checkout, set `APP`, `REPO`, `PNPM_ENTRY`,
`NODE`, `MULTIPLAYER_TGZ` and `ORIGIN` to their absolute local paths or origin.
The app's existing workspace policy and packed overrides must already be in
place. These commands have not been run for this fixture:

```sh
cd "$APP"
cp -R "$REPO/evals/agent-eval/tasks/large-live/reference/weft-warp/." .
"$NODE" --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const fixture = join(process.env.REPO, 'evals/agent-eval/tasks/large-live/reference/dependencies.json')
const pins = JSON.parse(readFileSync(fixture, 'utf8'))
const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
manifest.dependencies = { ...manifest.dependencies, ...pins.dependencies,
  '@weft-js/multiplayer': `file:${process.env.MULTIPLAYER_TGZ}` }
manifest.devDependencies = { ...manifest.devDependencies, ...pins.devDependencies }
writeFileSync('package.json', JSON.stringify(manifest, null, 2) + '\n')
JS
"$NODE" "$PNPM_ENTRY" install --no-frozen-lockfile
"$NODE" --input-type=module <<'JS'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
const secret = randomBytes(32).toString('hex')
writeFileSync('.env', `DATABASE_URL=file:.data/app.db\nBETTER_AUTH_SECRET=${secret}\nBETTER_AUTH_URL=${process.env.ORIGIN}\n`, { mode: 0o600, flag: 'wx' })
JS
"$NODE" "$PNPM_ENTRY" exec weft db generate
```

The `APP` must have no existing `.env` for this command. `REPO`,
`MULTIPLAYER_TGZ` and `ORIGIN` must be exported for the Node processes. Keep the
app, database and generated secret inside M4's owned staging root and remove
them after retaining bounded calibration receipts.

## Manager setup, typecheck and build

After the combined candidate includes the reference and the manager script,
run on Yuna with verified compiler artifacts and the cached pnpm entry:

```sh
WEFT_T06_PNPM_ENTRY="$HOME/.cache/node/corepack/v1/pnpm/12.15.0/bin/pnpm.mjs" \
  bash "$HOME/work/weft-S5-verify/repo/evals/agent-eval/evidence/T06/yuna-large-reference.sh"
```

This prepares an owned SQLite app, generates a disposable secret, verifies
packed-current packages, generates migrations, typechecks and builds. It
retains phase logs and status at the printed receipt path, and removes the owned
staging root. It does not launch a server or run browser checks; the configured
`http://127.0.0.1:4173` is a planned local origin and must match a later server
listener. A passing build is not proof of session, authorization or live data.
