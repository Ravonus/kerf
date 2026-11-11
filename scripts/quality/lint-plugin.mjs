// The rules Oxlint has no built-in for, as an Oxlint plugin so they show up with every other lint. These are rules for the
// framework's own code; what apps get is `kerf check`, in the compiler and the CLI.
import { repoRoot } from '../lib/helpers.mjs'
import { analyzeComments } from './comment-budget.mjs'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const root = repoRoot

// ---- what is public ----

const EXTENSIONS = ['', '.ts', '.tsx', '.mjs', '.d.ts', '.d.mts', '/index.ts', '/index.tsx']
const resolveFile = (from, spec) =>
  EXTENSIONS.map((e) => resolve(dirname(from), spec + e)).find(
    (f) => existsSync(f) && !f.endsWith('/'),
  )
const typeTwin = (file) =>
  [file.replace(/\.m?js$/, '.d.ts'), file.replace(/\.m?js$/, '.d.mts')].find(
    (f) => f !== file && existsSync(f),
  )
const targets = (value) =>
  typeof value === 'string'
    ? [value]
    : value && typeof value === 'object'
      ? value.types
        ? [value.types]
        : Object.values(value).flatMap(targets)
      : []

/** Every file a package's `exports` reaches, directly or through a re-export, with the names it gives out (`*` is all of them). */
function publicNames() {
  const names = new Map()
  const add = (file, wanted) => {
    const twin = typeTwin(file)
    if (twin) return add(twin, wanted)
    const have = names.get(file)
    if (have === '*' || (have && wanted !== '*' && [...wanted].every((n) => have.has(n)))) return
    names.set(file, wanted === '*' || !have ? wanted : new Set([...have, ...wanted]))
    if (!/\.[cm]?[jt]sx?$/.test(file) || !existsSync(file)) return
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/^export\s+\*\s+from\s+['"](\.[^'"]+)['"]/gm)) {
      const next = resolveFile(file, m[1])
      if (next) add(next, '*')
    }
    for (const m of text.matchAll(
      /^export\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"](\.[^'"]+)['"]/gm,
    )) {
      const next = resolveFile(file, m[2])
      const given = m[1]
        .split(',')
        .map(
          (s) =>
            s
              .trim()
              .replace(/^type\s+/, '')
              .split(/\s+as\s+/)[0],
        )
        .filter(Boolean)
      if (next) add(next, new Set(given))
    }
  }
  for (const dir of readdirSync(join(root, 'packages'))) {
    const manifest = join(root, 'packages', dir, 'package.json')
    if (!existsSync(manifest)) continue
    const { exports: map } = JSON.parse(readFileSync(manifest, 'utf8'))
    for (const value of Object.values(map ?? {})) {
      for (const target of targets(value))
        if (!target.includes('*') && !/\.(css|json)$/.test(target))
          add(join(root, 'packages', dir, target), '*')
    }
  }
  return names
}

let cachedNames
const publicIn = (file) => (cachedNames ??= publicNames()).get(resolve(root, file))
const hasDoc = (source, node) =>
  source.getCommentsBefore(node).some((c) => c.type === 'Block' && c.value.startsWith('*'))

const declared = (node) => {
  if (node.id?.name) return [node.id.name]
  return (node.declarations ?? []).flatMap((d) => (d.id?.name ? [d.id.name] : []))
}

// ---- commented-out code ----

const CODE = [
  /^(?:import|export)\s.*(?:from\s+['"]|\{.*\}$)/,
  /^(?:const|let|var)\s+[\w${[][^=]*=\s*\S/,
  /^(?:async\s+)?function\s*\*?\s*\w*\s*\(.*[{)]$/,
  /^class\s+\w+.*\{$/,
  /^(?:if|for|while|switch)\s*\(.*\)\s*\{?$/,
  /^(?:return|await|throw)\s+\S.*;$/,
  /^[\w$.]+\(.*\);?$/,
  /^[\w$.[\]]+\s*(?:=|\+=|-=)\s*[^=>\s].*;$/,
  /^\}\s*(?:else\b.*)?\{?$/,
  /^<\/?[A-Z]\w*(?:\s[^>]*)?\/?>$/,
]
const looksLikeCode = (line) => CODE.some((re) => re.test(line)) && !/^[\w$.]+\(\w*\)$/.test(line) // `foo()` alone names a thing in prose

// ---- the plugin ----

const allComments = (context, check) => ({
  Program() {
    for (const comment of context.sourceCode.getAllComments()) check(comment)
  },
})

export default {
  meta: { name: 'kerf' },
  rules: {
    'comment-budget': {
      create(context) {
        return {
          Program(node) {
            for (const warning of analyzeComments(context.sourceCode.text, context.filename)
              .warnings) {
              const position = { line: warning.line, column: 0 }
              context.report({
                node,
                loc: { start: position, end: position },
                message: warning.message,
              })
            }
          },
        }
      },
    },
    'no-commented-code': {
      create: (context) =>
        allComments(context, (comment) => {
          if (comment.type === 'Block' && comment.value.startsWith('*')) return // a doc comment may show code
          const before = context.sourceCode.text.slice(
            context.sourceCode.text.lastIndexOf('\n', comment.range[0]) + 1,
            comment.range[0],
          )
          if (before.trim()) return // beside code it's a note on that line
          for (const raw of comment.value.split('\n')) {
            if (/^\s{2,}/.test(raw) && comment.type === 'Line') continue // indented under a sentence: a usage example
            const line = raw.replace(/^\s*\*?\s*/, '').trimEnd()
            if (looksLikeCode(line))
              return context.report({
                node: comment,
                message: 'Commented-out code. Delete it: git keeps the history.',
              })
          }
        }),
    },
    'todo-needs-issue': {
      create: (context) =>
        allComments(context, (comment) => {
          if (
            /\b(?:TODO|FIXME|XXX|HACK)\b/.test(comment.value) &&
            !/#\d+|github\.com\/\S+\/issues\/\d+/.test(comment.value)
          )
            context.report({
              node: comment,
              message: 'A TODO needs an issue: write `TODO(#123): ...`, or do it now.',
            })
        }),
    },
    'disable-needs-reason': {
      create: (context) =>
        allComments(context, (comment) => {
          const m = comment.value.match(/^\s*(?:oxlint|eslint)-(?:disable|enable)[\w-]*\s*(.*)$/s)
          if (!m || /^\s*(?:oxlint|eslint)-enable/.test(comment.value)) return
          const reason = m[1].split(/\s--\s/)[1]?.trim() ?? ''
          if (reason.length < 8)
            context.report({
              node: comment,
              message:
                'A disable comment names its rule and says why: `// oxlint-disable-next-line <rule> -- <reason>`.',
            })
        }),
    },
    'public-doc': {
      create(context) {
        const names = publicIn(context.filename)
        if (!names) return {}
        const source = context.sourceCode
        const isPublic = (name) => names === '*' || names.has(name)
        const done = new Set()
        const need = (node, name) => {
          if (!isPublic(name) || done.has(name)) return
          if (hasDoc(source, node)) done.add(name) // the overloads of one function share a comment
          else
            context.report({
              node,
              message: `\`${name}\` is public: give it a /** doc comment */ saying what it's for.`,
            })
        }
        const topLevel = new Map()
        return {
          Program(program) {
            for (const statement of program.body) {
              const inner =
                statement.type === 'ExportNamedDeclaration' && statement.declaration
                  ? statement.declaration
                  : statement
              for (const name of declared(inner)) topLevel.set(name, statement)
            }
          },
          ExportNamedDeclaration(node) {
            if (node.source) return
            if (node.declaration) for (const name of declared(node.declaration)) need(node, name)
            for (const spec of node.specifiers ?? []) {
              const local = spec.local?.name,
                target = topLevel.get(local)
              if (target) need(target, spec.exported?.name ?? local)
            }
          },
          ExportDefaultDeclaration(node) {
            need(node, 'default')
          },
        }
      },
    },
    'no-html-sink': {
      create(context) {
        const message = (what) =>
          `${what} writes markup with no escaping. Build nodes, or escape it and say why in a disable comment.`
        const sinks = new Set(['innerHTML', 'outerHTML', 'srcdoc'])
        return {
          AssignmentExpression(node) {
            const name =
              node.left.type === 'MemberExpression' && !node.left.computed
                ? node.left.property.name
                : undefined
            if (sinks.has(name) && !(node.right.type === 'Literal' && !node.right.value))
              context.report({ node, message: message(`Setting ${name}`) })
          },
          CallExpression(node) {
            const { callee } = node
            if (callee.type !== 'MemberExpression' || callee.computed) return
            const name = callee.property.name
            if (
              name === 'insertAdjacentHTML' ||
              name === 'setHTMLUnsafe' ||
              (name === 'write' && callee.object.name === 'document') ||
              name === 'createContextualFragment'
            )
              context.report({ node, message: message(name) })
          },
          JSXAttribute(node) {
            if (node.name.name === 'dangerouslySetInnerHTML' || node.name.name === 'innerHTML')
              context.report({ node, message: message(node.name.name) })
          },
        }
      },
    },
    'skip-needs-reason': {
      create(context) {
        const source = context.sourceCode
        return {
          CallExpression(node) {
            const { callee } = node
            const member = callee.type === 'CallExpression' ? callee.callee : callee
            if (
              member.type !== 'MemberExpression' ||
              member.computed ||
              !['skip', 'skipIf', 'todo', 'fails'].includes(member.property.name)
            )
              return
            if (
              !['it', 'test', 'describe', 'suite'].includes(
                member.object.name ?? member.object.object?.name,
              )
            )
              return
            const line = node.loc.start.line
            const reasoned = source
              .getAllComments()
              .some((c) => c.loc.end.line === line || c.loc.end.line === line - 1)
            if (!reasoned)
              context.report({
                node,
                message: 'A skipped test says why: put a comment on or just above this line.',
              })
          },
        }
      },
    },
  },
}
