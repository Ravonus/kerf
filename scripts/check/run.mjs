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
  const results = await pool(items, limit, async (item) => ({ item, ...(await job(item)) }))
  const failed = results.filter((r) => r.code !== 0)
  return {
    problems: failed.flatMap((r) => [`--- ${r.item}`, ...r.out.trim().split('\n').slice(-40)]),
  }
}
