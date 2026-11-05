// Shared server-module conventions and local resolution for project state checks.
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { local } from '../alias.mjs'

/** Whether a file uses the server module convention. */
export const isServerModule = (rel) =>
  rel.startsWith('src/server/') || /\.server\.[cm]?[jt]sx?$/.test(rel)
/** Resolve a local project module with the existing state-check extensions. */
export function moduleFile(root, from, spec) {
  const abs = local(join(root, from), spec)
  if (!abs) return undefined
  const base = relative(root, abs).split('\\').join('/').replace(/\.js$/, '')
  return ['', '.ts', '.tsx', '.mts', '.js', '/index.ts']
    .map((x) => base + x)
    .find((f) => /\.[cm]?[jt]sx?$/.test(f) && existsSync(join(root, f)))
}
