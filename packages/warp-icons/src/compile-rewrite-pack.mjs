export function rewritePack({
  unit,
  catalog,
  code,
  file,
  edits,
  packLocals,
  packName,
  unknownMessage,
  packIds,
  line,
}) {
  let lookups = false
  for (const pack of packLocals(unit)) {
    for (const n of unit.ast.body)
      if (n.type === 'ImportDeclaration' && n.source.value === '@weft-js/warp-icons')
        for (const s of n.specifiers)
          if (s.local.name === pack && s.type === 'ImportDefaultSpecifier')
            edits.push({ start: s.start, end: s.end, text: `* as ${pack}` })
    for (const { local: l, node } of unit.members) {
      if (l !== pack) continue
      if (!node.computed) {
        if (catalog)
          packName(node.property.name, catalog, new Set(), () => {
            throw Object.assign(new Error(unknownMessage(node.property.name, packIds(catalog))), {
              loc: { file, ...line(code, node.property.start) },
            })
          })
        continue
      }
      edits.push(
        { start: node.start, end: node.property.start, text: '__icon(' },
        { start: node.property.end, end: node.end, text: ')' },
      )
      lookups = true
    }
  }
  return lookups
}
