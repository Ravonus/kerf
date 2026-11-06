export function requireRefusal(status, label, expected, code, body) {
  if (status !== expected || (code && body?.e?.code !== code))
    throw new Error(`${label}: unexpected refusal status or code (${status})`)
}

export function requireListener(pids, childPid) {
  if (pids.length !== 1 || pids[0] !== childPid)
    throw new Error('inconclusive: listener is not the owned server process')
}

export function passwordIsHashed(rows, password) {
  if (!rows.length || rows.some((row) => typeof row.password !== 'string' || !row.password))
    throw new Error('password hash is missing')
  if (rows.some((row) => row.password.includes(password))) throw new Error('plain password stored')
}
