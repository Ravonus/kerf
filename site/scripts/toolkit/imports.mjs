// Keep copied named imports within the split-pane width without changing their bindings.
export function formatImport(names, from, type = false) {
  const prefix = `import ${type ? 'type ' : ''}`
  const single = `${prefix}{ ${names.join(', ')} } from '${from}'`
  if (Array.from(single).length <= 58) return single
  const end = `} from '${from}'`
  return `${prefix}{\n${names.map((name, index) => `  ${name}${index + 1 < names.length ? ',' : ''}`).join('\n')}\n${
    Array.from(end).length <= 58 ? end : `} from\n  '${from}'`
  }`
}
