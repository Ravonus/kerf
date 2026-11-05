// Core box provenance shared by TypeScript diagnostic mappings.
const programs = new WeakMap()

/** Resolved core exports and member declarations for one checker program. */
function coreMembers(ts, program, checker) {
  if (programs.has(program)) return programs.get(program)
  const roots = new Set(),
    shapes = [],
    derivedRoots = new Set()
  for (const file of program.getSourceFiles()) {
    for (const node of file.statements) {
      if (
        (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) ||
        node.moduleSpecifier?.text !== '@weft-js/core'
      )
        continue
      const module = checker.getSymbolAtLocation(node.moduleSpecifier)
      if (!module) continue
      for (let symbol of checker.getExportsOfModule(module)) {
        if (!['State', 'Derived'].includes(symbol.name)) continue
        const derived = symbol.name === 'Derived'
        if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
        const type = checker.getDeclaredTypeOfSymbol(symbol)
        const value = checker.getPropertyOfType(type, 'value')
        roots.add(symbol)
        if (derived) derivedRoots.add(symbol)
        shapes.push({
          names: checker.getPropertiesOfType(type).map((property) => property.name),
          declarations: new Set(value?.getDeclarations() ?? []),
        })
      }
    }
  }
  const core = { roots, shapes, derivedRoots }
  programs.set(program, core)
  return core
}

/** Whether a type avoids any, unknown and unresolved type parameters. */
function known(ts, type) {
  if (!type || type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter))
    return false
  return !type.isUnion() || type.types.every((part) => known(ts, part))
}

module.exports = { coreMembers, known }
