// `weft capture …` runs @weft-js/capture's command from the project, so the CLI itself carries no browser driver.
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Runs `weft capture <argv>` with the project's @weft-js/capture; resolves with its exit code. */
export async function commandCapture(argv, root) {
  let entry
  try {
    entry = createRequire(join(root, 'package.json')).resolve('@weft-js/capture/cli')
  } catch {
    throw Object.assign(
      new Error(
        'weft capture needs @weft-js/capture in this project: pnpm add -D @weft-js/capture',
      ),
      { code: 'E_USAGE' },
    )
  }
  const { main } = await import(pathToFileURL(entry).href)
  return main(argv)
}
