export const title = (name) => name.replace(/(^|-)(.)/g, (_, __, c) => c.toUpperCase())
/** The export a name and variant compile to: `check`, `solid` is `CheckIconSolid`. */
export const pascal = (name, variant = '') =>
  `${title(name)}Icon${variant ? variant[0].toUpperCase() + variant.slice(1) : ''}`
