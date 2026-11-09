// Inventory explicit Button radius selectors across every tracked theme source.
import { transform } from 'lightningcss'

function selectorFacts(
  value,
  negative = false,
  result = { positive: false, negative: false, skin: false, element: false },
) {
  if (!value || typeof value !== 'object') return result
  const negated = negative || (value.type === 'pseudo-class' && ['not', 'has'].includes(value.kind))
  if (value.type === 'type' && value.name === 'button' && !negated) result.element = true
  if (value.type === 'attribute' && value.operation?.value === 'button') {
    if (value.name === 'data-scope') result[negated ? 'negative' : 'positive'] = true
    if (value.name === 'data-skin') result.skin = true
  }
  for (const child of Object.values(value)) selectorFacts(child, negated, result)
  return result
}

export function auditButtonRadius(sources, read) {
  const records = []
  for (const source of sources) {
    const text = read(source)
    const lines = text.split('\n')
    transform({
      filename: source,
      code: Buffer.from(text),
      visitor: {
        Rule: {
          style(rule) {
            const value = rule.value
            const facts = selectorFacts(value.selectors)
            if (!facts.positive && !facts.negative && !facts.skin && !facts.element) return
            const declarations = [
              ...value.declarations.declarations,
              ...value.declarations.importantDeclarations,
            ]
            const properties = declarations
              .map((item) =>
                item.property === 'unparsed' ? item.value.propertyId.property : item.property,
              )
              .filter((name) => /^border(?:-[a-z]+)*-radius$/.test(name))
            if (!properties.length) return
            const location = value.loc
            const selector = lines
              .slice(location.line)
              .join('\n')
              .slice(location.column - 1)
              .split('{')[0]
              .trim()
            const sweepChild =
              facts.positive && / > :where\(\[data-part="sweep(?:-base)?"\]\)\s*$/.test(selector)
            const buttonPseudo =
              facts.positive && selector === ':where([data-scope="button"])::before'
            const attachedHost =
              facts.positive &&
              selector.includes('[data-scope="button-group"][data-attached]') &&
              / > \[data-scope="button"\]:not\(:(?:first|last)-child\)\)$/.test(selector)
            const host = facts.positive && !sweepChild && !buttonPseudo
            const classification = sweepChild
              ? 'attached sweep child'
              : buttonPseudo
                ? 'Button pseudo-element'
                : attachedHost
                  ? 'attached Button host'
                  : host
                    ? 'Button scope candidate'
                    : facts.element
                      ? 'generic button element candidate'
                      : facts.skin
                        ? 'excluded canvas skin'
                        : 'excluded negative or query-only scope'
            records.push({
              source,
              line: location.line + 1,
              selector,
              properties,
              classification,
              reason: sweepChild
                ? 'The styled owner is the sweep child, with Button and group ancestors.'
                : buttonPseudo
                  ? 'The styled owner is the Button fill pseudo-element.'
                  : attachedHost
                    ? 'The styled owner is the attached Button, not the group ancestor.'
                    : facts.positive
                      ? 'Requires positive styled-owner and cascade review.'
                      : facts.element
                        ? 'An HTML button may be a Button host; scope and cascade require review.'
                        : facts.skin
                          ? 'data-skin identifies a stage skin, not a Button scope.'
                          : 'A negative or relational test does not establish the styled Button owner.',
            })
          },
        },
      },
    })
  }
  return records
}
