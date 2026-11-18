export interface ShellCheckResult {
  version: 1
  ok: boolean
  root: string
  diagnostics: { code: string; file: string; why: string; severity: string }[]
  summary: { files: number; errors: number; warnings: number; byCode: Record<string, number> }
  ms: number
}

/** List every missing shell contract by file and export without executing app code. */
export function checkShell(root: string): Promise<ShellCheckResult>
