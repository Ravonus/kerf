import { scanJsx } from '../jsx-scan.mjs'
import { WARP } from './values.mjs'
import { element1 } from './element-1.mjs'
import { element2 } from './element-2.mjs'
import { element3 } from './element-3.mjs'
import { element4 } from './element-4.mjs'
import { element5 } from './element-5.mjs'
import { element6 } from './element-6.mjs'
import { element7 } from './element-7.mjs'

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
    const warpName = (n) => scan.imports.some((i) => i.source === WARP && i.local === n)
    const labelled = new Set(
      scan.elements.map((e) => e.attr('for')?.value ?? e.attr('htmlFor')?.value).filter(Boolean),
    )
    const headings = []
    const solids = new Map()

    for (const el of scan.elements) {
      if (tokens) {
        element1({ el, f, report })
        element2({ el, f, report, warpName, looks, localComponents, scan })
        element3({ el, f, report, localComponents })
      }
      element4({ el, report })
      element5({ el, report, labelled })
      element6({ el, f, report })
      element7({ el, warpName, headings, solids, scan })
    }

    for (let i = 1; i < headings.length; i++) {
      const { level, el } = headings[i]
      if (level > headings[i - 1].level + 1)
        report(
          'D035',
          el.start,
          el.tagEnd,
          `The outline jumps from h${headings[i - 1].level} to h${level}: screen-reader users navigate by headings (WCAG 1.3.1).`,
          undefined,
          'warning',
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
