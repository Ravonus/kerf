// Mask comments using parsed token trivia so strings, templates and regular expressions stay intact.
import { createRequire } from 'node:module'

const ts = createRequire(new URL('../../packages/cli/package.json', import.meta.url))('typescript')

export function references(text) {
  const file = ts.createSourceFile(
    'entry.mjs',
    text,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.JS,
  )
  const chars = text.split('')
  function visit(node) {
    const children = node.getChildren(file)
    if (children.length) {
      for (const child of children) visit(child)
      return
    }
    const ranges = [
      ...(ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []),
      ...(ts.getTrailingCommentRanges(text, node.getEnd()) ?? []),
    ]
    for (const range of ranges) {
      for (let i = range.pos; i < range.end; i++)
        if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' '
    }
  }
  visit(file)
  return [
    ...chars
      .join('')
      .matchAll(
        /(?:from\s*|import\s*\(|import\s*|require\s*\(|new\s+URL\s*\()\s*['"](\.[^'"]+\.mjs)['"]/g,
      ),
  ].map((match) => match[1])
}
