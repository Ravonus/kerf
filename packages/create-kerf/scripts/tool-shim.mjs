// A launcher must run at its original path: pnpm's CI shim resolves files beside itself.
import { writeFileSync } from 'node:fs'

/** Forward a restricted-PATH tool to its original launcher without relocating that launcher. */
export function writeToolShim(destination, executable) {
  const quoted = `'${executable.replaceAll("'", "'\\''")}'`
  writeFileSync(destination, `#!/bin/sh\nexec ${quoted} "$@"\n`, { mode: 0o755 })
}
