import type { Manifest } from '../server/types'

export interface ShellContractFinding {
  code: 'Q021'
  severity: 'error'
  file: string
  line: number
  name: string
  why: string
}

/** Locate the shared startup contract and its peer provider. */
export function bootstrapFiles(root: string): { contract?: string; provider?: string }

/** Catalog missing shell contracts without importing app modules. */
export function checkShellContracts(
  root: string,
  routesDir?: string,
  manifest?: Manifest,
): ShellContractFinding[]

/** Refuse a shell build with all catalogued findings. */
export function requireShellContracts(root: string, routesDir?: string, manifest?: Manifest): void
