import { createHash } from 'node:crypto'
import { cpSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { here, state } from '../lib/paths.mjs'

export async function reference({ stackNames, boxFor, opt, gradeOnce, passedAll, say, cleanup }) {
  const rows = {}
  for (const name of stackNames) {
    const box = boxFor(name)
    cpSync(join(here, 'tasks', opt.task, 'reference', name), box.app, { recursive: true })
    const g = await gradeOnce(box, name, opt.task, 1, true)
    rows[name] = {
      pass: passedAll(g),
      passed: g.passed,
      total: g.total,
      failed: g.failed,
      flaky: g.flaky,
      quality: g.quality,
    }
    say(
      `${name}: ${g.passed}/${g.total}`,
      g.failed?.length ? JSON.stringify(g.failed).slice(0, 900) : '',
    )
    cleanup(box)
  }
  const dir = join(here, 'tasks', opt.task)
  writeFileSync(
    join(state, `reference-${opt.task}.json`),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        hidden: createHash('sha256')
          .update(readFileSync(join(dir, 'hidden.mjs')))
          .digest('hex')
          .slice(0, 16),
        rows,
      },
      null,
      1,
    ),
  )
  console.log(JSON.stringify(rows, null, 1))
  process.exit(Object.values(rows).every((r) => r.pass) ? 0 : 1)
}

/** The hidden tests have to be able to fail: each planted bug, on each stack, must fail the test named for it. */
export async function mutants({ stackNames, boxFor, opt, gradeOnce, say, cleanup }) {
  const list = JSON.parse(readFileSync(join(here, 'tasks', opt.task, 'mutants.json'), 'utf8'))
  const rows = []
  const sourceOf = (name, root) => {
    const out = []
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name)
        e.isDirectory() ? walk(p) : out.push(p)
      }
    }
    walk(root)
    return out
  }
  for (const name of stackNames)
    for (const m of list) {
      const box = boxFor(name)
      const ref = join(here, 'tasks', opt.task, 'reference', name)
      cpSync(ref, box.app, { recursive: true })
      let hit = 0
      for (const f of sourceOf(name, ref)) {
        const file = join(box.app, relative(ref, f))
        let text = readFileSync(file, 'utf8')
        const find = m.alt && text.includes(m.alt) ? m.alt : m.find
        const replace = m.replace.replace('TEXT', find === m.alt ? 'text.value' : 'text')
        if (text.includes(find)) {
          text = text.replaceAll(find, replace)
          writeFileSync(file, text)
          hit++
        }
      }
      if (!hit) throw new Error(`${m.name}: nothing to mutate on ${name}`)
      const g = await gradeOnce(box, name, opt.task, 1, false)
      const caught = g.failed.some((f) => f.title === m.mustFail)
      rows.push({
        stack: name,
        mutant: m.name,
        caught,
        passed: g.passed,
        total: g.total,
        failed: g.failed.map((f) => f.title),
      })
      say(`${name} / ${m.name}: ${caught ? 'caught' : 'MISSED'} (${g.passed}/${g.total})`)
      cleanup(box)
    }
  writeFileSync(join(state, `mutants-${opt.task}.json`), JSON.stringify(rows, null, 1))
  process.exit(rows.every((r) => r.caught) ? 0 : 1)
}
