// every booking's whole name shows inside its box, and no word is split across lines
export const timelineNames = (page, sel) =>
  page.evaluate((at) => {
    const root = document.querySelector(at),
      sc = root.querySelector('[data-part="timeline-edges"] > [data-part="scroller"]')
    const events = [...root.querySelectorAll('[data-part="lane"] [data-part="event"]')].map((e) => {
      const t = e.querySelector('[data-part="event-title"]'),
        st = e.querySelector('[data-part="event-start"]')
      const shown = (el) => getComputedStyle(el).display !== 'none'
      const words = document.createRange()
      words.selectNodeContents(t)
      const w = words.getBoundingClientRect(),
        box = e.getBoundingClientRect()
      // a word split over two lines has letters on two different line tops
      const split = []
      for (const m of t.textContent.matchAll(/\S+/g)) {
        const r = document.createRange(),
          node = t.firstChild
        if (!node || node.nodeType !== 3) continue
        r.setStart(node, m.index)
        r.setEnd(node, m.index + m[0].length)
        const tops = new Set([...r.getClientRects()].map((x) => Math.round(x.top)))
        if (tops.size > 1) split.push(m[0])
      }
      return {
        name: t.textContent,
        w: box.width,
        title: shown(t),
        start: shown(st),
        cut:
          shown(t) &&
          (w.right > box.right + 1 || w.bottom > box.bottom + 1 || w.left < box.left - 1),
        split,
      }
    })
    return {
      events,
      sw: sc.scrollWidth,
      cw: sc.clientWidth,
      overflow: root.querySelector('[data-scope="edges"]').dataset.overflow ?? '',
    }
  }, sel)
