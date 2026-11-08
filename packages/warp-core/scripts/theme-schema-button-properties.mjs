// Interpret reviewed Button declarations without claiming the full component cascade.
const fields = {
  'border-color': ['borderColor', 'color', 'forbidden'],
  'border-radius': ['radius', 'radius', 'px'],
  'block-size': ['height', 'length', 'px'],
  padding: ['padding', 'space', 'px'],
  border: ['border', 'border', 'px width only'],
  'font-family': ['font.family', 'family', 'forbidden'],
  'font-size': ['font.size', 'font-size', 'px'],
  'font-weight': ['font.weight', 'weight', 'unitless'],
  'letter-spacing': ['font.letterSpacing', 'tracking', 'px'],
  'text-transform': ['font.transform', 'transform-case', 'forbidden'],
  'text-decoration-thickness': ['textDecorationThickness', 'width', 'px'],
  'text-decoration-color': ['textDecorationColor', 'color', 'forbidden'],
  'background-color': ['bg', 'color', 'forbidden'],
  color: ['text', 'color', 'forbidden'],
  scale: ['scale', 'scalar', 'unitless'],
}
const exclusions = {
  overflow: 'Frame clipping confines the animated sweep to the host.',
  'text-decoration': 'The link variant keeps its existing underline anatomy.',
  'text-underline-offset': 'The existing link-variant underline placement is not an inventoried Button role.',
  inset: 'Pseudo-element geometry covers the fill or preserves the minimum hit area.',
  'z-index': 'The negative pseudo-element stack is internal paint ordering, not a public depth token.',
  opacity: 'The fill animation or disabled visual treatment uses this computed opacity.',
  transform: 'The transform drives the existing fill wipe, not a free transform control.',
  'transform-origin': 'The fill wipe changes its origin with the existing state.',
  'background-origin': 'The fill pseudo-element paints at its border box.',
  'background-image': 'The gradients use measured pointer and sweep geometry for the animated fill.',
  transition: 'The complete transition string controls existing sweep clocks and edges.',
  'transition-duration': 'The multi-channel sweep timing is an existing mechanical clock.',
  filter: 'The press brightness effect is part of the existing fill animation.',
  '--warp-btn-fill': 'The existing sweep gate selects the current emphasis and disabled behavior.',
}

export function buttonProperty(property, selector) {
  if (property === '--warp-sweep-fill' || property === '--warp-sweep-radius') {
    return { classification: 'external sweep dependency',
      reason: 'The existing sweep token is consumed by the unresolved signature sheet.' }
  }
  if (property === 'border-radius' && selector.includes('::before')) {
    return { classification: 'mechanical exclusion', reason: 'The fill inherits its host corner geometry.' }
  }
  if (exclusions[property]) return { classification: 'mechanical exclusion', reason: exclusions[property] }
  const field = fields[property]
  if (!field) throw new Error(`button: unclassified property ${property}`)
  const [path, domain, units] = field
  return { classification: 'partial property binding', path, domain, units,
    reason: 'This site matches the property table; other Button sites remain under review.' }
}

export function localDependencies(inputs, definitions) {
  return inputs.filter(({ token }) => token.startsWith('--_')).map(({ token }) => ({
    token,
    definitions: definitions.filter((row) => row.property === token).map((row) => ({
      selector: row.selector, source: row.source, fallbackSpan: row.fallbackSpan,
    })),
    status: 'partial: other definitions and cascade conditions remain unresolved',
  }))
}
