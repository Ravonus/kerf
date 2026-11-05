// Install policy for standalone scaffold directories outside the repository workspace.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const POLICY = `packages: []
minimumReleaseAge: 4320
minimumReleaseAgeExclude:
  - '@weft-js/*'
`

/** Create, but never overwrite, the policy used for a fresh standalone workspace. */
export function writePolicy(dir) {
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), POLICY, { flag: 'wx', mode: 0o600 })
}

/** Remove inherited package-manager settings before setting the controlled registry. */
export function pnpmEnv(base, registry) {
  const env = Object.fromEntries(
    Object.entries(base).filter(([key]) => !/^(npm_config_|pnpm_)/i.test(key)),
  )
  env.npm_config_registry = registry
  return env
}
