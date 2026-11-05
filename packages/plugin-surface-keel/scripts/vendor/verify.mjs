// Check every generated path and reject missing, changed or stale companion modules.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

function modulePaths(dir, prefix) {
  const root = join(dir, prefix)
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const name = `${prefix}/${entry.name}`
    return entry.isDirectory() ? modulePaths(dir, name) : [name]
  })
}

export function verifyNoExtras(outputs, dir) {
  const expected = new Set(outputs.keys())
  for (const prefix of ['keel-render', 'keel-theme'])
    for (const name of modulePaths(dir, prefix))
      if (!expected.has(name)) throw new Error(`Stale generated file: ${name}`)
}

export function verify(outputs, dir) {
  for (const [name, bytes] of outputs) {
    const file = join(dir, name)
    if (!existsSync(file)) throw new Error(`Missing generated file: ${name}`)
    if (!readFileSync(file).equals(Buffer.from(bytes)))
      throw new Error(`Changed generated file: ${name}`)
  }
  verifyNoExtras(outputs, dir)
}
