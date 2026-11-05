// Reproduce the local source split from the independently installed, pinned Pretext package.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const upstream = path.join(root, 'node_modules/@chenglou/pretext')
const vendor = path.join(root, 'vendor/pretext/src')
const receipt = JSON.parse(fs.readFileSync(path.join(root, 'scripts/pretext-split.json'), 'utf8'))
const digest = (data) => createHash('sha256').update(data).digest('hex')
const version = JSON.parse(fs.readFileSync(path.join(upstream, 'package.json'), 'utf8')).version
if (version !== receipt.version)
  throw new Error(`Pretext version ${version} does not match ${receipt.version}`)
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'weft-pretext-split-'))
try {
  for (const [name, hash] of Object.entries(receipt.inputs)) {
    const data = fs.readFileSync(path.join(upstream, 'src', name))
    if (digest(data) !== hash) throw new Error(`Pinned source differs: ${name}`)
    const target = path.join(temp, name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, data)
  }
  const patch = JSON.parse(
    fs.readFileSync(path.join(root, 'scripts/pretext-split.patch.json'), 'utf8'),
  ).join('')
  execFileSync('git', ['apply', '-'], { cwd: temp, input: patch, stdio: 'pipe' })
  for (const [name, hash] of Object.entries(receipt.outputs)) {
    const data = fs.readFileSync(path.join(temp, name))
    if (digest(data) !== hash) throw new Error(`Patched source differs from receipt: ${name}`)
    const target = path.join(vendor, name)
    if (process.argv.includes('--write')) {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, data)
    } else if (!fs.existsSync(target) || !data.equals(fs.readFileSync(target))) {
      throw new Error(`Vendored source differs from patch: ${name}`)
    }
  }
  console.log(
    `Pretext ${version}: ${Object.keys(receipt.outputs).length} split files match the patch.`,
  )
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}
