// Generates the corpus test/oracle.test.tsx runs (git-ignored), before any test file is collected.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export default function setup() {
  const script = fileURLToPath(new URL('../scripts/gen-corpus.mjs', import.meta.url))
  execFileSync(
    process.execPath,
    [script, '40', fileURLToPath(new URL('./corpus-gen', import.meta.url))],
    { stdio: 'ignore' },
  )
}
