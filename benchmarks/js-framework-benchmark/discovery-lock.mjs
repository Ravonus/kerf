// Create the minimal metadata the upstream server reads, not an npm install lockfile.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const directory = process.argv[2]
if (!directory) throw new Error('Pass the upstream frameworks/keyed/weft directory')
const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
const version = manifest.dependencies['@weft-js/core']
const lock = {
  name: manifest.name,
  version: manifest.version,
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': { name: manifest.name, version: manifest.version },
    'node_modules/@weft-js/core': { version },
  },
}
await writeFile(join(directory, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`, {
  flag: 'wx',
})
