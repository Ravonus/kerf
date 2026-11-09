// Collect token reads and local-channel dependencies without assigning theme ownership.
import { transform } from 'lightningcss'

export function consumers(source, text) {
  const declarations = []
  transform({
    filename: source,
    code: Buffer.from(text),
    visitor: {
      Declaration(declaration) {
        const reads = new Set()
        function visit(value) {
          if (!value || typeof value !== 'object') return
          if (value.type === 'var' && value.value?.name?.ident) reads.add(value.value.name.ident)
          for (const child of Object.values(value)) visit(child)
        }
        visit(declaration.value)
        if (!reads.size) return
        const property =
          declaration.property === 'custom'
            ? declaration.value.name
            : declaration.property === 'unparsed'
              ? declaration.value.propertyId.property
              : declaration.property
        declarations.push({
          property,
          reads: [...reads].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
        })
      },
    },
  })
  return declarations
}

// Collect declared public token names, including literal-valued definitions.
export function declaredTokens(source, text) {
  const names = new Set()
  transform({
    filename: source,
    code: Buffer.from(text),
    visitor: {
      Declaration(declaration) {
        if (declaration.property === 'custom' && declaration.value.name.startsWith('--warp-')) {
          names.add(declaration.value.name)
        }
      },
    },
  })
  return [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}
