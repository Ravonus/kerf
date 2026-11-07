// Run checks from the repository root and retain their combined output.
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { repoRoot } from '../lib/helpers.mjs'
import { pool } from '../jobs.mjs'

export function run(cmd, args, cwd = '.', env = {}) {
  return new Promise((ok) => {
    const child = spawn(cmd, args, {
      cwd: join(repoRoot, cwd),
      env: { ...process.env, NO_COLOR: '1', ...env },
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = '',
      stdout = '',
      stderr = ''
    child.stdout.on('data', (d) => {
      out += d
      stdout += d
    })
    child.stderr.on('data', (d) => {
      out += d
      stderr += d
    })
    child.on('error', (e) => ok({ code: 1, out: String(e) }))
    child.on('close', (code) => ok({ code, out, stdout, stderr }))
  })
}

/** Run jobs with bounded concurrency and join their failures. */
export async function allJobs(items, job, limit) {
  const results = await pool(items, limit, async (item) => {
    const started = performance.now()
    return { item, ...(await job(item)), seconds: (performance.now() - started) / 1000 }
  })
  const failed = results.filter((r) => r.code !== 0)
  for (const r of failed) {
    process.stderr.write(`--- ${r.item} ---\n${r.out}${r.out.endsWith('\n') ? '' : '\n'}`)
  }
  const slowest = results
    .toSorted((a, b) => b.seconds - a.seconds)
    .slice(0, 3)
    .map((r) => `${r.item.replace(/^packages\//, '')} ${r.seconds.toFixed(0)}s`)
  return {
    problems: failed.flatMap((r) => [`--- ${r.item}`, ...r.out.trim().split('\n').slice(-40)]),
    detail: `${results.length} run; slowest ${slowest.join(', ')}`,
  }
}
