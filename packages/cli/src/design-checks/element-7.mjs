import { scanParent } from './rules.mjs'

export function element7({ el, warpName, headings, solids, scan }) {
  // -- outline --
  const h = /^h([1-6])$/.exec(el.name)
  const level = h
    ? Number(h[1])
    : el.name === 'Heading' && warpName('Heading')
      ? Number(el.attr('level')?.value ?? /^\d$/.exec(el.attr('level')?.expr ?? '')?.[0] ?? 2)
      : 0
  if (level) headings.push({ level, el })

  // -- one primary action per region --
  if (
    el.name === 'Button' &&
    warpName('Button') &&
    (!el.attr('emphasis') || el.attr('emphasis')?.value === 'solid') &&
    !el.attr('tone')
  ) {
    const region =
      el.ancestors.findLast((a) =>
        [
          'Card',
          'Modal',
          'Drawer',
          'Popover',
          'section',
          'form',
          'header',
          'footer',
          'main',
          'aside',
          'Alert',
        ].includes(a),
      ) ?? ''
    const key = `${region}:${el.ancestors.length}:${scanParent(el, scan.elements)?.start ?? 0}`
    solids.set(key, [...(solids.get(key) ?? []), el])
  }
}
