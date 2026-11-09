import { execFileSync } from 'node:child_process'

const windows = process.platform === 'win32'

/** Working sets across the server's process tree, in MB: Windows has neither `ps` nor groups. */
function treeMB(root) {
  const script =
    'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.WorkingSetSize)" }'
  const all = execFileSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
  })
    .trim()
    .split(/\r?\n/)
    .map((l) => l.split(' ').map(Number))
  const tree = new Set([root])
  for (let grew = true; grew;) {
    grew = false
    for (const [pid, parent] of all)
      if (tree.has(parent) && !tree.has(pid)) {
        tree.add(pid)
        grew = true
      }
  }
  return all.filter(([pid]) => tree.has(pid)).reduce((n, p) => n + p[2], 0) / 1048576
}

/** Sum of resident memory across the server's process group, in MB. */
export function rssMB(server) {
  try {
    if (windows) return treeMB(server.pid)
    return (
      execFileSync('ps', ['-axo', 'pgid=,rss='], { encoding: 'utf8' })
        .split('\n')
        .map((l) => l.trim().split(/\s+/))
        .filter(([g]) => +g === server.pid)
        .reduce((n, [, r]) => n + +r, 0) / 1024
    )
  } catch {
    return null
  }
}
