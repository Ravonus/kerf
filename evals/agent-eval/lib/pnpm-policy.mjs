// Install policy for standalone scaffold directories outside the repository workspace.
import { readFileSync, writeFileSync } from 'node:fs'
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

// Move legacy manifest overrides into the one policy pnpm 12 reads.
export function normalizeOverrides(dir) {
  const manifestPath = join(dir, 'package.json')
  const policyPath = join(dir, 'pnpm-workspace.yaml')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const maps = [manifest.overrides, manifest.pnpm?.overrides].filter((value) => value !== undefined)
  if (!maps.length) return false
  const desired = new Map()
  for (const map of maps) {
    if (!map || typeof map !== 'object' || Array.isArray(map))
      throw new Error('manifest overrides must be a map')
    for (const [key, value] of Object.entries(map)) {
      if (typeof value !== 'string') throw new Error(`unsupported override value: ${key}`)
      if (desired.has(key) && desired.get(key) !== value)
        throw new Error(`conflicting override: ${key}`)
      desired.set(key, value)
    }
  }
  const policy = readFileSync(policyPath, 'utf8')
  const updated = mergeOverrides(policy, desired)
  delete manifest.overrides
  if (manifest.pnpm) {
    delete manifest.pnpm.overrides
    if (!Object.keys(manifest.pnpm).length) delete manifest.pnpm
  }
  if (updated !== policy) writeFileSync(policyPath, updated)
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  return true
}

function scalar(value) {
  const clean = value.trim().replace(/\s+#.*$/, '')
  if (clean.startsWith('"')) return JSON.parse(clean)
  if (clean.startsWith("'")) {
    if (!clean.endsWith("'")) throw new Error('unsupported quoted override')
    return clean.slice(1, -1).replaceAll("''", "'")
  }
  if (!clean || /[[\]{}]/.test(clean)) throw new Error('unsupported workspace override value')
  return clean
}

function mergeOverrides(policy, desired) {
  const lines = policy.split('\n')
  const headers = lines.flatMap((line, i) => (/^overrides\s*:/.test(line) ? [i] : []))
  if (headers.length > 1 || (headers.length && !/^overrides:\s*(?:#.*)?$/.test(lines[headers[0]])))
    throw new Error('unsupported workspace overrides layout')
  if (!headers.length)
    return `${policy.replace(/\n?$/, '\n')}overrides:\n${[...desired].map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}\n`).join('')}`
  const header = headers[0]
  const existing = new Map()
  for (let i = header + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^\S/.test(line) && !line.startsWith('#')) break
    const match = line.match(/^  ("(?:\\.|[^"])*"|'(?:''|[^'])*'|[^\s:][^:]*?):\s*(.*?)\s*$/)
    if (!match) continue
    const key = scalar(match[1])
    if (desired.has(key)) {
      if (existing.has(key)) throw new Error(`duplicate workspace override: ${key}`)
      existing.set(key, scalar(match[2]))
    }
  }
  const additions = []
  for (const [key, value] of desired) {
    if (existing.has(key) && existing.get(key) !== value)
      throw new Error(`workspace override conflicts: ${key}`)
    if (!existing.has(key)) additions.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
  }
  lines.splice(header + 1, 0, ...additions)
  return lines.join('\n')
}
