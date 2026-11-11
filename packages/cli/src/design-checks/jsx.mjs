import { scanJsx } from '../jsx-scan.mjs'
import { VENEER } from './values.mjs'
import { checkLayoutValues } from './layout-values.mjs'
import { checkHeadingLinks } from './heading-links.mjs'
import { checkNativeControls } from './native-controls.mjs'
import { checkContrast } from './contrast.mjs'
import { checkAccessibleNames } from './accessible-names.mjs'
import { checkInteraction } from './interaction.mjs'
import { checkOutline } from './outline.mjs'

export function checkJsx({ files, reporter, tokens, looks }) {
  for (const f of files) {
    if (!/\.[jt]sx$/.test(f.rel)) continue
    let scan
    try {
      scan = scanJsx(f.text, f.rel)
    } catch {
      continue // syntax errors are W000's
    }
    const report = reporter(f)
    const localComponents = new Set(scan.functions.keys())
    const veneerName = (n) => scan.imports.some((i) => i.source === VENEER && i.local === n)
    const labelled = new Set(
      scan.elements.map((e) => e.attr('for')?.value ?? e.attr('htmlFor')?.value).filter(Boolean),
    )
    const headings = []
    const solids = new Map()

    for (const el of scan.elements) {
      if (tokens) {
        checkLayoutValues({ el, f, report })
        checkHeadingLinks({ el, f, report, veneerName, looks, localComponents, scan })
        checkNativeControls({ el, f, report, localComponents })
      }
      checkContrast({ el, report })
      checkAccessibleNames({ el, report, labelled })
      checkInteraction({ el, f, report })
      checkOutline({ el, veneerName, headings, solids, scan })
    }

    for (let i = 1; i < headings.length; i++) {
      const { level, el } = headings[i]
      if (level > headings[i - 1].level + 1)
        report.warning(
          'D035',
          el.start,
          el.tagEnd,
          `The outline jumps from h${headings[i - 1].level} to h${level}: screen-reader users navigate by headings (WCAG 1.3.1).`,
        )
    }
    for (const group of solids.values()) {
      for (const el of group.slice(1))
        report(
          'D038',
          el.start,
          el.tagEnd,
          `${group.length} solid Buttons side by side: one primary action per region.`,
          {
            description: 'Make this one soft',
            safe: false,
            text: ' emphasis="soft"',
            at: [el.tagEnd, el.tagEnd],
          },
        )
    }
  }
}
