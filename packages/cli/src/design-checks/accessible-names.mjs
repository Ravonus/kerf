import { named, hasName, GENERIC, UNNAMED } from './rules.mjs'

export function checkAccessibleNames({ el, report, labelled }) {
  // -- accessible names --
  if (['input', 'select', 'textarea'].includes(el.name)) {
    const type = el.attr('type')?.value
    const skip = ['hidden', 'submit', 'button', 'reset', 'image'].includes(type)
    const id = el.attr('id')
    // A computed id can pair with a label anywhere, a component around the field can render its label, and an
    // aria-hidden field (a honeypot) has no name to give. `for` counts on a component too: a `<Field for>` passes it on.
    const unseen =
      id?.kind === 'expr' ||
      el.attr('aria-hidden')?.value === 'true' ||
      el.ancestors.some((a) => /^[A-Z]/.test(a))
    if (
      !skip &&
      !unseen &&
      !named(el) &&
      !(id?.value && labelled.has(id.value)) &&
      !el.ancestors.includes('label')
    )
      report(
        'D030',
        el.start,
        el.tagEnd,
        `<${el.name}> has no label: a screen reader announces only "edit" (WCAG 1.3.1, 4.1.2).${el.attr('placeholder') ? ' A placeholder is not a label.' : ''}`,
      )
  }
  if (
    ['button', 'a', 'Button', 'Link'].includes(el.name) &&
    !el.attr('label') &&
    !named(el) &&
    !(el.name === 'a' && !el.attr('href')) &&
    !hasName(el.children)
  )
    report(
      'D031',
      el.start,
      el.tagEnd,
      `<${el.name}> has no name a screen reader can read: only an icon, or nothing (WCAG 4.1.2).`,
    )
  const label = el.attr('aria-label') ?? el.attr('aria-labelledby')
  const role = el.attr('role')
  if (
    label &&
    GENERIC.has(el.name) &&
    (!role || (role.kind === 'string' && UNNAMED.has(role.value)))
  )
    report(
      'D041',
      label.start,
      label.end,
      `\`${label.name}\` on a <${el.name}>${role ? ` with role "${role.value}"` : ''}: ARIA forbids naming it, so screen readers skip the name (axe aria-prohibited-attr, Lighthouse).`,
    )
  if (el.name === 'img' && !el.attr('alt') && !el.attrs.some((a) => a.kind === 'spread'))
    report(
      'D032',
      el.start,
      el.tagEnd,
      '<img> has no `alt`: a screen reader reads out the file name (WCAG 1.1.1).',
    )
}
