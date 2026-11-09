// List structure warnings without changing tracked files.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Check package source paths and index contents. */
export function structure(files, read = (file) => readFileSync(file, 'utf8')) {
  const source = files.filter((file) => /^packages\/[^/]+\/src\/.*\.(?:ts|tsx)$/.test(file))
  const folders = new Map()
  const warnings = []
  for (const file of source) {
    const folder = dirname(file)
    folders.set(folder, (folders.get(folder) ?? 0) + 1)
    const name = file.slice(file.lastIndexOf('/') + 1)
    if (name.endsWith('.tsx') && !/^[A-Z][A-Za-z0-9]*\.tsx$/.test(name))
      warnings.push(`${file}: component name should be PascalCase`)
    if (name.endsWith('.ts') && !/^(?:[a-z0-9]+(?:-[a-z0-9]+)*|index|.*\.d)\.ts$/.test(name))
      warnings.push(`${file}: module name should be kebab-case`)
    if (name === 'index.ts') {
      const content = read(file).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
      if (content.replace(/export\s+(?:type\s+)?(?:\*\s*(?:as\s+\w+\s*)?|\{[^}]*\}\s*)from\s*['"][^'"]+['"]\s*;?/g, '').trim())
        warnings.push(`${file}: index should only re-export`)
    }
  }
  for (const [folder, count] of folders) {
    if (count > 12) warnings.push(`${folder}: ${count} source files (maximum 12)`)
    if (!/^packages\/[^/]+\/src$/.test(folder) && count < 3)
      warnings.push(`${folder}: ${count} source files (minimum 3)`)
  }
  return { warnings, source: source.length, folders: folders.size }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
  const result = structure(files)
  console.log(`Tracked files: ${files.length}; package source files: ${result.source}; folders: ${result.folders}`)
  for (const warning of result.warnings) console.log(warning)
  console.log(`Warnings: ${result.warnings.length}`)
}
