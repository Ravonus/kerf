// Map unambiguous simple-scope CSS consumers to partial property groups.
const fields = {
  color: ['text', 'text,label,highlight,stroke,base,shadowColor'],
  border: ['border', 'border'],
  'border-color': ['borderColor', 'borderColor and actual logical border colour longhands'],
  'border-width': ['borderWidth', 'borderWidth and actual logical border width longhands'],
  'background-image': ['backgroundImage', 'backgroundImage'],
  opacity: ['opacity', 'scale,opacity'], scale: ['scale', 'scale,opacity'],
  'stroke-width': ['strokeWidth', 'strokeWidth,textDecorationThickness'],
  'text-decoration-thickness': ['textDecorationThickness', 'strokeWidth,textDecorationThickness'],
  'border-radius': ['radius', 'radius and actual logical corner radius longhands'],
  'box-shadow': ['shadow', 'shadow'],
  padding: ['padding', 'padding and actual logical padding longhands'],
  'padding-block': ['paddingBlock', 'padding and actual logical padding longhands'],
  'padding-inline': ['paddingInline', 'padding and actual logical padding longhands'],
  'padding-block-end': ['paddingBlockEnd', 'padding and actual logical padding longhands'],
  'padding-inline-end': ['paddingInlineEnd', 'padding and actual logical padding longhands'],
  margin: ['margin', 'margin and actual logical margin longhands'],
  'margin-block-start': ['marginBlockStart', 'margin and actual logical margin longhands'],
  gap: ['gap', 'gap,rowGap,columnGap'],
  'row-gap': ['rowGap', 'gap,rowGap,columnGap'],
  'column-gap': ['columnGap', 'gap,rowGap,columnGap'],
  'block-size': ['height', 'height,width,minHeight,maxHeight,minWidth,maxWidth'],
  'inline-size': ['width', 'height,width,minHeight,maxHeight,minWidth,maxWidth'],
  'min-block-size': ['minHeight', 'height,width,minHeight,maxHeight,minWidth,maxWidth'],
  'max-block-size': ['maxHeight', 'height,width,minHeight,maxHeight,minWidth,maxWidth'],
  'min-inline-size': ['minWidth', 'height,width,minHeight,maxHeight,minWidth,maxWidth'],
  'max-inline-size': ['maxWidth', 'height,width,minHeight,maxHeight,minWidth,maxWidth'],
  'font-family': ['font.family', 'font.family'], 'font-size': ['font.size', 'font.size'],
  'font-weight': ['font.weight', 'font.weight'], 'line-height': ['font.lineHeight', 'font.lineHeight'],
  'letter-spacing': ['font.letterSpacing', 'font.letterSpacing'],
  'text-transform': ['font.transform', 'font.transform'], 'font': ['font.css', 'font.css'],
  'font-variant-numeric': ['font.variantNumeric', 'font.style,font.variantNumeric,font.variation'],
}

export function normalizeSite(site, propertyTable, inventory, declaredTokens) {
  if (site.classification !== 'unresolved' || site.owner.kind !== 'scope') return null
  if (!inventory.has(site.owner.name)) return null
  let spec = fields[site.property]
  const camel = (value) => value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
  if (!spec && /^(padding|margin)-(block|inline)(-(start|end))?$/.test(site.property)) {
    const family = site.property.startsWith('padding') ? 'padding' : 'margin'
    spec = [camel(site.property), `${family} and actual logical ${family} longhands`]
  }
  if (!spec && /^inset(?:-(?:block|inline)(?:-(?:start|end))?)?$/.test(site.property)) {
    spec = [camel(site.property), 'actual inset longhands']
  }
  if (!spec && /^border-(?:block|inline)(?:-(?:start|end))?-(color|width)$/.test(site.property)) {
    const family = site.property.endsWith('color') ? 'borderColor' : 'borderWidth'
    const label = family === 'borderColor' ? 'colour' : 'width'
    spec = [camel(site.property), `${family} and actual logical border ${label} longhands`]
  }
  if (!spec && /^border-(?:start|end)-(?:start|end)-radius$/.test(site.property)) {
    spec = [camel(site.property), 'radius and actual logical corner radius longhands']
  }
  if (!spec) return null
  const [path, authority] = spec
  const row = propertyTable.find((item) => item[0] === authority)
  if (!row) throw new Error(`Missing property rule: ${authority}`)
  const [, , domain, units] = row
  const part = site.owner.name
  const suffix = path.replace(/\./g, '-').replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
  let token = `--warp-${part}-${suffix}`
  if (declaredTokens.has(token)) token = `--warp-${part}-local-${suffix}`
  return { part, state: 'rest', path, token, domain, units }
}
