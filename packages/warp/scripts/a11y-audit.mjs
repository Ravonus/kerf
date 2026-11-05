import { pixelContrast } from './a11y-contrast.mjs'

const RULES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
const settle = (page) => page.waitForTimeout(700)

export async function auditState({ page, label, axe, stop, states, known }) {
  await settle(page)
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ content: axe })
  const res = await page.evaluate(runAxe, RULES)
  // the page has settled: freeze transitions so hiding one text for its screenshot can't fade another's colour
  const frozen = await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; }',
  })
  const measured = []
  for (const [i, target] of res.review.entries()) {
    const m = await pixelContrast(page, i)
    if (m) measured.push({ target, ...m })
  }
  await frozen.evaluate((n) => n.remove())
  // at reduce, no loop may move anything but opacity
  const moving = stop.motion === 'reduce' ? await page.evaluate(movingAnimations) : []
  const failing = measured.filter((m) => !m.ok && !known(m, stop, label))
  states.push({
    label,
    violations: [
      ...res.violations,
      ...(failing.length
        ? [
            {
              id: 'color-contrast (measured)',
              impact: 'serious',
              nodes: failing.map((m) => ({
                target: m.target,
                why: `${m.where} ${m.ratio}:1 (needs ${m.need}:1), text ${m.fg} on ${m.bg}`,
              })),
            },
          ]
        : []),
    ],
    spec: measured
      .filter((m) => !m.ok && known(m, stop, label))
      .map((m) => ({ ...m, finding: known(m, stop, label).why })),
    measured,
    moving,
  })
}

const runAxe = async (rules) => {
  document.querySelectorAll('[data-a11y-px]').forEach((e) => e.removeAttribute('data-a11y-px'))
  const r = await window.axe.run(document, {
    runOnly: rules,
    resultTypes: ['violations', 'incomplete'],
    elementRef: true,
  })
  const inactive = (n) => n.element?.closest('[data-disabled], :disabled, [aria-disabled="true"]')
  const plain = (v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => ({
      target: n.target.join(' '),
      why: (n.any[0]?.message ?? n.failureSummary ?? '').slice(0, 200),
    })),
  })
  for (const v of r.violations)
    if (v.id === 'color-contrast') v.nodes = v.nodes.filter((n) => !inactive(n))
  // the contrast axe couldn't decide (a pseudo-element or overlapping fill, short text): measured from pixels below
  const review = r.incomplete
    .filter((v) => v.id === 'color-contrast')
    .flatMap((v) => v.nodes)
    .filter((n) => n.element && !inactive(n))
  review.forEach((n, i) => n.element.setAttribute('data-a11y-px', String(i)))
  return {
    violations: r.violations.filter((v) => v.nodes.length).map(plain),
    incomplete: r.incomplete.map(plain),
    review: review.map((n) => n.target.join(' ')),
  }
}

const movingAnimations = () =>
  document
    .getAnimations()
    .filter((a) => {
      if (a.playState !== 'running' || a.effect?.getComputedTiming().iterations <= 1) return false
      return a.effect
        .getKeyframes()
        .some((k) =>
          Object.keys(k).some(
            (p) => !['offset', 'computedOffset', 'easing', 'composite', 'opacity'].includes(p),
          ),
        )
    })
    .map(
      (a) =>
        `${a.animationName ?? 'animation'} on ${a.effect?.target?.tagName?.toLowerCase()}${a.effect?.target?.dataset?.scope ? `[${a.effect.target.dataset.scope}]` : ''}`,
    )
