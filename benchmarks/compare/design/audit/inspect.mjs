/** Tab through the page: a stop whose outline, shadow, border and background all stay as they were shows nothing. */
export function focusLoss(page) {
  return page.evaluate(async () => {
    const look = (el) => {
      const c = getComputedStyle(el)
      return [
        c.outlineStyle,
        c.outlineWidth,
        c.outlineColor,
        c.boxShadow,
        c.borderColor,
        c.backgroundColor,
        c.textDecorationLine,
      ].join('|')
    }
    const els = [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')]
      .filter((e) => e.tabIndex >= 0 && e.offsetParent)
      .slice(0, 25)
    const out = { stops: els.length, invisible: 0 }
    for (const el of els) {
      const rest = look(el)
      el.focus({ focusVisible: true })
      if (
        document.activeElement === el &&
        look(el) === rest &&
        look(el.parentElement ?? el) === look(el.parentElement ?? el)
      ) {
        // Fields draw the ring on a wrapper (veneer's sweep, shadcn's ring on a parent): check two ancestors while focused.
        const up = [el.parentElement, el.parentElement?.parentElement].filter(Boolean)
        const before = up.map(look)
        el.blur()
        const after = up.map(look)
        if (before.every((v, i) => v === after[i])) out.invisible++
      }
      el.blur()
    }
    return out
  })
}

/** Every visible element's computed values, as `kind → value → count`, plus each role's look. */
export function collect(page) {
  return page.evaluate(() => {
    const values = {},
      roles = {}
    const add = (kind, v) => {
      if (
        v &&
        v !== 'none' &&
        v !== 'normal' &&
        v !== '0px' &&
        v !== 'rgba(0, 0, 0, 0)' &&
        v !== 'auto'
      )
        (values[kind] ??= {})[v] = ((values[kind] ??= {})[v] ?? 0) + 1
    }
    const role = (name, el, c) => {
      ;(roles[name] ??= []).push(
        [
          c.fontSize,
          c.fontWeight,
          c.borderRadius,
          c.minHeight === 'auto' ? '' : c.minHeight,
          Math.round(el.getBoundingClientRect().height),
          c.paddingLeft,
          c.backgroundColor,
          c.color,
        ].join(' '),
      )
    }
    for (const el of document.body.querySelectorAll('*')) {
      if (
        ['SCRIPT', 'STYLE', 'TEMPLATE'].includes(el.tagName) ||
        (el.closest('svg') && el.tagName !== 'svg')
      )
        continue
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const c = getComputedStyle(el)
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
      if (hasText) {
        add('font-size', c.fontSize)
        add('font-weight', c.fontWeight)
        add('line-height', c.lineHeight)
        add('font-family', c.fontFamily)
        add('color', c.color)
      }
      add('background', c.backgroundColor)
      if (parseFloat(c.borderTopWidth)) add('border-color', c.borderTopColor)
      add('radius', c.borderTopLeftRadius)
      add('shadow', c.boxShadow)
      for (const p of [
        'paddingTop',
        'paddingLeft',
        'marginTop',
        'marginBottom',
        'rowGap',
        'columnGap',
      ])
        add('spacing', c[p])
      const t = el.tagName.toLowerCase()
      if (/^h[12]$/.test(t)) role(t, el, c)
      if (t === 'button' || el.getAttribute('role') === 'button')
        role(
          parseFloat(c.backgroundColor.split(',')[3] ?? 1) > 0 &&
            c.backgroundColor !== 'rgba(0, 0, 0, 0)'
            ? 'filled button'
            : 'quiet button',
          el,
          c,
        )
      if (t === 'input' && !['checkbox', 'radio', 'hidden'].includes(el.type)) role('input', el, c)
      if (t === 'tr') role('table row', el, c)
      if (t === 'a' && el.closest('nav')) role('nav link', el, c)
    }
    return { values, roles }
  })
}
