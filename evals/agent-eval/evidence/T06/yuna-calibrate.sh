#!/bin/bash
# Run on the manager's combined checkout. No agent or model is invoked.
set -euo pipefail

if [[ "${WEFT_T06_CLEAN_ENV:-}" != 1 ]]; then
  : "${WEFT_T06_PNPM_ENTRY:?Set WEFT_T06_PNPM_ENTRY to the cached pnpm 12.15.0 bin/pnpm.mjs}"
  exec /usr/bin/env -i HOME="$HOME" PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
    WEFT_T06_CLEAN_ENV=1 WEFT_T06_PNPM_ENTRY="$WEFT_T06_PNPM_ENTRY" \
    WEFT_T06_NODE="${WEFT_T06_NODE:-$HOME/work/toolchain/node-v26.13.0-darwin-arm64/bin/node}" \
    WEFT_T06_REPO="${WEFT_T06_REPO:-$HOME/work/weft-S5-verify/repo}" \
    WEFT_T06_TASK="${WEFT_T06_TASK:-medium-shop}" \
    PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/Library/Caches/ms-playwright}" \
    /bin/bash "$0"
fi

repo="$WEFT_T06_REPO"
[[ "$WEFT_T06_TASK" == medium-shop || "$WEFT_T06_TASK" == edit-shop ]] || { echo 'Unknown calibration task' >&2; exit 2; }
node="$WEFT_T06_NODE"
pnpm="$WEFT_T06_PNPM_ENTRY"
pnpm_root="$(dirname "$(dirname "$pnpm")")"
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo 'Requires macOS arm64' >&2; exit 2; }
[[ -x "$node" && -f "$pnpm" && -x "$pnpm_root/pnpm-native" ]] || { echo 'Missing cached Node or native pnpm' >&2; exit 2; }
[[ "$("$node" --version)" == "v$(tr -d '[:space:]' < "$repo/.nvmrc")."* ]] || { echo 'Node version does not match .nvmrc' >&2; exit 2; }
[[ "$("$node" "$pnpm" --version)" == 12.15.0 ]] || { echo 'Expected cached pnpm 12.15.0' >&2; exit 2; }
[[ -d "$PLAYWRIGHT_BROWSERS_PATH" ]] || { echo 'Missing Playwright browser cache' >&2; exit 2; }
command -v lsof >/dev/null || { echo 'lsof is required for owned process cleanup' >&2; exit 2; }
git -C "$repo" rev-parse --verify origin/main >/dev/null
git -C "$repo" diff --quiet HEAD -- packages crates evals/agent-eval || { echo 'Candidate source is dirty' >&2; exit 2; }
[[ -z "$(git -C "$repo" ls-files --others --exclude-standard -- packages crates evals/agent-eval)" ]] || { echo 'Candidate has untracked source' >&2; exit 2; }
free_kib="$(df -Pk "$HOME" | awk 'NR==2 {print $4}')"
[[ "$free_kib" =~ ^[0-9]+$ ]] || { echo 'Cannot read free space' >&2; exit 2; }
(( free_kib >= 13 * 1024 * 1024 )) || { echo 'Need 3 GiB staging plus 10 GiB free' >&2; exit 2; }

base="$HOME/work/weft-S5-verify"
mkdir -p "$base" "$repo/evidence/T06"
job="$(mktemp -d "$base/t06-calibration.XXXXXXXX")"
cleanup() {
  # Kill only this user's processes whose cwd is inside this job's private projects.
  local pids
  owned_pids() {
    lsof -nP -a -u "$(id -u)" -d cwd -Fpn 2>/dev/null | awk -v root="$job/projects" '
      /^p/ { pid=substr($0,2) } /^n/ { path=substr($0,2); if (path==root || index(path,root "/")==1) print pid }
    ' || true
  }
  pids="$(owned_pids)"
  if [[ -n "$pids" ]]; then
    echo "$pids" | xargs kill -TERM 2>/dev/null || true
    sleep 1
    pids="$(owned_pids)"
    if [[ -n "$pids" ]]; then echo "$pids" | xargs kill -KILL 2>/dev/null || true; fi
  fi
  rm -rf -- "$job"
}
trap cleanup EXIT
receipts="$repo/evidence/T06/calibration-$(git -C "$repo" rev-parse --short=12 HEAD)-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir "$receipts"
printf 'Calibration receipts: %s (progress: setup.log)\n' "$receipts"
exec > "$receipts/setup.log" 2>&1

export WEFT_EVAL_ROOT="$job" WEFT_EVAL_DEPS="$job/deps" WEFT_T06_JOB="$job" WEFT_T06_REPO="$repo"
export WEFT_EVAL_HOST_HOME="$HOME"
export HOME="$job/home" CI=1 COREPACK_ENABLE_NETWORK=0 NO_COLOR=1
mkdir -p "$HOME" "$job/bin" "$job/source" "$job/state/tgz" "$job/state/golden/weft-warp" "$job/projects" "$WEFT_EVAL_DEPS"
export PATH="$job/bin:$(dirname "$node"):/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
printf '#!/bin/bash\nexec %q %q "$@"\n' "$node" "$pnpm" > "$job/bin/pnpm"
chmod 755 "$job/bin/pnpm"

printf '%s\n' "$(git -C "$repo" rev-parse HEAD)" > "$receipts/candidate-sha.txt"
printf '%s\n' "$("$node" --version)" > "$receipts/node-version.txt"
printf '%s\n' "$(pnpm --version)" > "$receipts/pnpm-version.txt"
git -C "$repo" archive HEAD packages crates/weft crates/weft-compiler pnpm-workspace.yaml pnpm-lock.yaml package.json | tar -xf - -C "$job/source"
source="$job/source"
stamp="$("$node" -e 'process.stdout.write(require(process.argv[1]).sourceStamp())' "$source/packages/core/scripts/native-stamp.cjs")"
[[ "$stamp" =~ ^[0-9a-f]{64}$ ]] || { echo 'Missing compiler source stamp' >&2; exit 2; }
mkdir -p "$source/packages/core/native"
for artifact in weft-compiler.darwin-arm64.node weft-compiler.wasm; do
  from="$repo/packages/core/native/$artifact"
  [[ -f "$from" && -f "$from.stamp" && "$(tr -d '[:space:]' < "$from.stamp")" == "$stamp" ]] || { echo "Compiler stamp mismatch: $artifact" >&2; exit 2; }
  cp "$from" "$from.stamp" "$source/packages/core/native/"
  shasum -a 256 "$from" >> "$receipts/compiler-sha256.txt"
done
printf '%s\n' "$stamp" > "$receipts/compiler-source-stamp.txt"

ready() {
  while :; do
    local free load footprint
    free="$(df -Pk "$job" | awk 'NR==2 {print $4}')"
    [[ "$free" =~ ^[0-9]+$ ]] || { echo 'Cannot read free space' >&2; return 1; }
    (( free >= 10 * 1024 * 1024 )) || { echo 'Free space below 10 GiB' >&2; return 1; }
    footprint="$(du -sk "$job" | awk '{print $1}')"
    [[ "$footprint" =~ ^[0-9]+$ ]] || { echo 'Cannot read staging size' >&2; return 1; }
    (( footprint <= 3 * 1024 * 1024 )) || { echo 'Staging exceeds 3 GiB' >&2; return 1; }
    load="$(uptime | sed -E 's/.*load averages?:[[:space:]]*//' | awk '{gsub(/,/, "", $1); print $1}')"
    [[ "$load" =~ ^[0-9]+([.][0-9]+)?$ ]] || { echo 'Cannot read load' >&2; return 1; }
    if awk -v n="$load" 'BEGIN {exit !(n <= 40)}'; then return 0; fi
    echo "Load $load is over 40; waiting" >&2
    sleep 30
  done
}

# Pack only archived candidate sources, including verified compiler artifacts.
ready
"$node" --input-type=module <<'NODE'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const stage = process.env.WEFT_T06_JOB
const { packWithAddon } = await import(pathToFileURL(join(stage, 'source/packages/create/scripts/pack-all.mjs')))
const packed = packWithAddon(join(stage, 'state/tgz'))
if (!packed['@weft-js/core'] || !packed['@weft-js/compiler-darwin-arm64']) throw Error('missing packed compiler')
writeFileSync(join(stage, 'state/tgz/tarballs.json'), JSON.stringify(packed, null, 2))
NODE

app="$job/state/golden/weft-warp/app"
"$node" "$source/packages/create/bin/create-weft.mjs" "$app" --ui warp --db none --no-auth --pm pnpm --no-git --no-install --yes --tarballs "$job/state/tgz"
"$node" --input-type=module <<'NODE'
import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const stage = process.env.WEFT_T06_JOB
const { writePackedPolicy } = await import(pathToFileURL(join(stage, 'source/packages/create/scripts/tarballs.mjs')))
const tarballs = JSON.parse((await import('node:fs')).readFileSync(join(stage, 'state/tgz/tarballs.json')))
const app = join(stage, 'state/golden/weft-warp/app')
writePackedPolicy(app, tarballs)
const { normalizeOverrides } = await import(pathToFileURL(join(process.env.WEFT_T06_REPO, 'evals/agent-eval/lib/pnpm-policy.mjs')))
normalizeOverrides(app)
appendFileSync(join(app, 'pnpm-workspace.yaml'), '\nnodeLinker: hoisted\n')
writeFileSync(join(stage, 'deps/package.json'), JSON.stringify({private:true,dependencies:{'playwright-core':'1.64.1','axe-core':'4.14.0'}}))
writePackedPolicy(join(stage, 'deps'))
NODE
[[ "$(cd "$app" && pnpm config get minimumReleaseAge)" == 4320 ]] || { echo 'Age policy missing for app' >&2; exit 2; }
[[ "$(cd "$WEFT_EVAL_DEPS" && pnpm config get minimumReleaseAge)" == 4320 ]] || { echo 'Age policy missing for grader' >&2; exit 2; }
ready
(cd "$app" && pnpm install --ignore-scripts --store-dir "$job/store")
ready
(cd "$WEFT_EVAL_DEPS" && pnpm install --ignore-scripts --store-dir "$job/store")
ready
"$node" "$repo/evals/agent-eval/evidence/T06/verify-packages.mjs" "$app" "$job/provenance" "$job/state/tgz/tarballs.json" > "$receipts/package-provenance.json"

# The grader runs with a fresh HOME and a sandbox; keep this cached pnpm inside its app copy.
mkdir -p "$app/.calibration-pnpm/bin" "$app/.calibration-bin"
cp "$pnpm_root/bin/pnpm.mjs" "$app/.calibration-pnpm/bin/"
cp "$pnpm_root/native-binary.mjs" "$pnpm_root/package.json" "$pnpm_root/pnpm-native" "$app/.calibration-pnpm/"
cp -R "$pnpm_root/dist" "$app/.calibration-pnpm/dist"
printf '%s\n' '#!/bin/sh' 'exec node "$(dirname "$0")/../.calibration-pnpm/bin/pnpm.mjs" "$@"' > "$app/.calibration-bin/pnpm"
chmod 755 "$app/.calibration-bin/pnpm" "$app/.calibration-pnpm/pnpm-native"
unset NODE_TEST_CONTEXT
"$node" "$repo/evals/agent-eval/evidence/T06/run-calibrations.mjs" "$repo" "$receipts" "$WEFT_T06_TASK"
printf 'Calibration receipts: %s\n' "$receipts"
