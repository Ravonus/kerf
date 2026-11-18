// Physical module paths are for resolution. Build identifiers also name linked packages,
// whose physical locations need not have any fixed relationship with the app.
import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const slash = (path) => path.replaceAll('\\', '/')

/** Use an app-relative path or the nearest linked package's name and package-relative path. */
export function buildPaths(root) {
  const directories = new Map()
  const packageAt = (dir) => {
    if (directories.has(dir)) return directories.get(dir)
    let pkg
    try {
      const { name } = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8'))
      if (name) pkg = { dir, name }
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error
    }
    const parent = dirname(dir)
    if (!pkg && parent !== dir) pkg = packageAt(parent)
    directories.set(dir, pkg)
    return pkg
  }
  return (id) => {
    const virtual = id.replace(/^\0/, '')
    if (virtual.startsWith('virtual:') || virtual.startsWith('#nitro/virtual/')) return virtual
    const path = id.startsWith('file:') ? fileURLToPath(id) : resolve(root, id)
    const local = slash(relative(root, path))
    if (local !== '..' && !local.startsWith('../') && !isAbsolute(local)) return local
    const portable = slash(path)
    const store = portable.lastIndexOf('/node_modules/.pnpm/')
    const installed = store === -1 ? portable.indexOf('/node_modules/') : store
    if (installed !== -1) return portable.slice(installed + 1)
    const pkg = packageAt(dirname(path))
    return pkg
      ? `node_modules/${pkg.name}/${slash(relative(pkg.dir, path))}`
      : portable.split('/').at(-1)
  }
}
