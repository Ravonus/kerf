// `packAll` plus this machine's addon as the prebuilt package a consumer would install, for the repo's own packed gates.
// Apart from tarballs.mjs, which create-weft's bin imports and which ships without packages/core beside it.
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { hostPlatform, writePlatformPackage } from '../../core/scripts/platform-package.mjs'
import { pack, packAll, pkgs } from './tarballs.mjs'

export function packWithAddon(dest) {
  const tarballs = packAll(dest)
  const addon = join(pkgs, 'weft/native', `weft-compiler.${process.platform}-${process.arch}.node`)
  const platform = hostPlatform()
  if (!platform || !existsSync(addon)) return tarballs
  const dir = join(dest, `.${platform.name}`)
  const { name } = writePlatformPackage(platform, addon, dir)
  const packed = pack(dir, dest)
  rmSync(dir, { recursive: true })
  return { ...tarballs, [name]: packed }
}
