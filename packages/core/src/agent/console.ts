export const consoleLog: { level: string; text: string }[] = []
export function patchConsole() {
  for (const level of ['error', 'warn'] as const) {
    const orig = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      if (consoleLog.length < 200)
        consoleLog.push({
          level,
          text: args
            .map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.message : safe(a)))
            .join(' ')
            .slice(0, 500),
        })
      orig(...args)
    }
  }
}
const safe = (v: unknown) => {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
