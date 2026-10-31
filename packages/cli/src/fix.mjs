// `weft fix`: apply every autofix `weft check` marks safe, the same edits an agent reads in `--json`. Unsafe fixes are
// suggestions and stay with the agent. Edits are applied last first; one that overlaps an earlier one waits for the
// next pass, and passes repeat until nothing is left (a fix can only shrink what the next check reports).

import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { check } from './check.mjs'

const PASSES = 5

export async function fix(root, options = {}) {
  root = resolve(root)
  const applied = []
  for (let pass = 0; pass < PASSES; pass++) {
    const { diagnostics } = await check(root, options)
    const byFile = new Map()
    for (const d of diagnostics) {
      if (!d.fix?.safe || !d.fix.edits?.length) continue
      const file = d.fix.edits[0].file
      byFile.set(file, [...(byFile.get(file) ?? []), d])
    }
    if (!byFile.size) break
    let changed = 0
    for (const [file, list] of byFile) {
      const edits = []
      for (const d of list) {
        if (d.fix.edits.some(e => e.file !== file || edits.some(x => e.offset[0] < x.offset[1] && x.offset[0] < e.offset[1]))) continue
        edits.push(...d.fix.edits)
        applied.push({ code: d.code, file, span: d.span })
        changed++
      }
      const abs = join(root, file)
      let text = readFileSync(abs, 'utf8')
      for (const e of edits.sort((a, b) => b.offset[0] - a.offset[0])) text = text.slice(0, e.offset[0]) + e.text + text.slice(e.offset[1])
      writeFileSync(abs, text)
    }
    if (!changed) break
  }
  return { ok: true, applied }
}
