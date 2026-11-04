/* warp-bar.js · the one specimen settings bar every page loads (01-foundations §13).
   Load it with a plain (not deferred) <script src="warp-bar.js"> right after the bar's </header>: it builds the
   bar and writes the deep-linked values on <html> before first paint.

   Page markup (nothing else; the six standard dials are generated here):
     <header data-specimen-bar data-label="foundations v0.2"            text after the "warp" mark
             data-flair-target=".cell, .stop"                            optional: these also get data-flair
             data-aliases="x:expression th:theme">                       optional: legacy URL params
       <div data-extra="matrix" data-label="Matrix" data-options="both:Both, light:Light, dark:Dark"
            title="page extra: …"></div>                                 declarative page extra (first option = default,
                                                                         or data-default="…")
       <div class="wb-ctl">…</div>                                       or any hand-written extra (same wb-ctl / wb-seg
     </header>                                                           pattern; radio name = data-ctl = URL param)

   Standard dials write <html data-*>; "auto" removes the attribute (the OS or the stop decides). Deep link with
   ?expression=&fields=&theme=&density=&motion=&flair= and any page extra by its name. ?stop= and ?dial= are
   always read as ?expression= (and rewritten). A user change writes the param, or drops it when it is the default.
   Events: document "warp-bar:change", detail { name, value }: every user change, plus the deep-linked and
   non-auto standard values once at DOMContentLoaded (after the page's own scripts are listening).
   API: window.warpBar = {
     set(name, value, { url = true, animate = true } = {}),   select from code (shortcuts, embeds); animate:false skips transition
     get(name),                                the checked value
     transition: null | (name, value, write) => void,   wrap user changes (View Transitions, a theme wipe);
                                               call write() exactly once: it writes the attribute, then emits
   }
   ≥ 1024px: one row (brand, the six dials, then "More" with the page extras in a popover).
   < 1024px: one 56px row (brand + Settings); every dial and extra is a row in the sheet under it. */
;(() => {
  'use strict'
  const bar = document.querySelector('[data-specimen-bar]')
  if (!bar) return
  const root = document.documentElement
  const STD = [
    ['expression', 'Expression', 'quiet:Quiet, balanced:Balanced, vivid:Vivid', 'balanced'],
    ['fields', 'Fields', 'floating:Floating, classic:Classic', 'floating'],
    ['theme', 'Theme', 'auto:Auto, light:Light, dark:Dark', 'auto'],
    ['density', 'Density', 'compact:Compact, cozy:Cozy, comfortable:Comfortable', 'cozy'],
    ['motion', 'Motion', 'auto:Auto, full:Full, reduce:Reduced', 'auto'],
    ['flair', 'Flair', 'auto:Auto, sweep:Sweep, none:None', 'auto'],
  ]
  const IS_STD = new Set(STD.map((s) => s[0]))
  const AUTO_REMOVES = new Set(['theme', 'motion', 'flair'])
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  const parse = (s) =>
    s
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
      .map((o) => {
        const i = o.indexOf(':')
        return i < 0 ? [o, o] : [o.slice(0, i).trim(), o.slice(i + 1).trim()]
      })
  // the group label shows in caps; its name is the hidden sentence-case copy (Chrome applies text-transform to names)
  const groupLabel = (name, label) =>
    `<span id="wb-l-${name}"><span class="wb-vh">${esc(label)}</span><span aria-hidden="true">${esc(label)}</span></span>`
  const group = (name, label, opts, def, title = '') =>
    `<div class="wb-ctl"${title ? ` title="${esc(title)}"` : ''}>${groupLabel(name, label)}<div class="wb-seg" role="radiogroup" aria-labelledby="wb-l-${name}" data-ctl="${name}">` +
    opts
      .map(
        ([v, l]) =>
          `<label><input type="radio" name="${name}" value="${esc(v)}"${v === def ? ' checked' : ''}><i>${esc(l)}</i></label>`,
      )
      .join('') +
    `</div></div>`

  // ---- build: the page's extras (declarative or hand-written) move into the popover / sheet
  const extras = [...bar.children]
    .map((el) => {
      if (!el.matches('[data-extra]')) return el.outerHTML
      const opts = parse(el.dataset.options || '')
      return group(
        el.dataset.extra,
        el.dataset.label || el.dataset.extra,
        opts,
        el.dataset.default || opts[0]?.[0],
        el.title,
      )
    })
    .join('')
  const ICON_MARK =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 3v18M10 3v18M15 3v18M20 3v18"/><path d="M2 9h20M2 15h20" stroke="var(--warp-color-accent-solid)" stroke-width="2"/></svg>'
  const ICON_SET =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>'
  const ICON_DOWN =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m7 10 5 5 5-5"/></svg>'
  bar.innerHTML = `<div class="wb-row">
    <a class="wb-mark" href="#top">${ICON_MARK}warp${bar.dataset.label ? ` <small>${esc(bar.dataset.label)}</small>` : ''}</a>
    <button type="button" class="wb-toggle" aria-expanded="false" aria-controls="wb-sheet">${ICON_SET}Settings<small data-wb-summary></small></button>
    <div class="wb-sheet" id="wb-sheet" role="group" aria-label="Specimen settings">
      ${STD.map(([n, l, o, d]) => group(n, l, parse(o), d)).join('')}
      ${
        extras
          ? `<hr><div class="wb-more"><button type="button" class="wb-more-btn" aria-expanded="false" aria-controls="wb-extras">More<small data-wb-more-summary></small>${ICON_DOWN}</button>
        <div class="wb-extras" id="wb-extras" role="group" aria-label="Page settings">${extras}</div></div>`
          : ''
      }
    </div>
  </div>`

  // ---- state
  const set = (el, k, v) =>
    AUTO_REMOVES.has(k) && v === 'auto' ? delete el.dataset[k] : (el.dataset[k] = v)
  const defaults = {}
  for (const g of bar.querySelectorAll('[data-ctl]'))
    defaults[g.dataset.ctl] =
      g.querySelector('input:checked')?.value ?? g.querySelector('input')?.value
  const checked = (n) => bar.querySelector(`input[name="${n}"]:checked`)
  const text = (i) => i?.closest('label').textContent.trim()
  const summary = () => {
    const s = bar.querySelector('[data-wb-summary]')
    if (s)
      s.textContent = [checked('expression'), checked('theme')]
        .filter(Boolean)
        .map(text)
        .join(' · ')
    const m = bar.querySelector('[data-wb-more-summary]')
    if (m)
      m.textContent = [...bar.querySelectorAll('.wb-extras [data-ctl]')]
        .map((g) => text(g.querySelector('input:checked')))
        .filter(Boolean)
        .join(' · ')
  }
  const emit = (name, value) => {
    // flair targets are written at emit time, so islands the page renders after this script still get it
    if (name === 'flair' && bar.dataset.flairTarget)
      document.querySelectorAll(bar.dataset.flairTarget).forEach((el) => set(el, 'flair', value))
    document.dispatchEvent(new CustomEvent('warp-bar:change', { detail: { name, value } }))
  }
  const writeUrl = (name, value) => {
    const q = new URLSearchParams(location.search)
    if (value === defaults[name]) q.delete(name)
    else q.set(name, value)
    history.replaceState(history.state, '', (q.size ? '?' + q : location.pathname) + location.hash)
  }
  const initial = []
  const apply = (name, value, { user = false, url = user, later = false } = {}) => {
    const write = () => {
      if (IS_STD.has(name)) set(root, name, value)
      summary()
      if (later) initial.push([name, value])
      else emit(name, value)
    }
    if (url) writeUrl(name, value)
    if (user && typeof api.transition === 'function') {
      let done = false
      api.transition(name, value, () => {
        if (!done) {
          done = true
          write()
        }
      })
    } else write()
  }

  // ---- deep link: canonical param wins over a legacy alias; aliases are rewritten to the canonical name
  const params = new URLSearchParams(location.search)
  const aliases = [
    ['stop', 'expression'],
    ['dial', 'expression'],
    ...(bar.dataset.aliases || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p.split(':')),
  ]
  let rewrote = false
  for (const [from, to] of aliases)
    if (params.has(from)) {
      if (!params.has(to)) params.set(to, params.get(from))
      params.delete(from)
      rewrote = true
    }
  if (rewrote)
    history.replaceState(
      history.state,
      '',
      (params.size ? '?' + params : location.pathname) + location.hash,
    )
  const api = { transition: null }
  for (const g of bar.querySelectorAll('[data-ctl]')) {
    const name = g.dataset.ctl,
      v = params.get(name)
    const r = v != null && g.querySelector(`input[value="${CSS.escape(v)}"]`)
    if (r) r.checked = true
    const cur = g.querySelector('input:checked')
    if (cur && IS_STD.has(name) && AUTO_REMOVES.has(name) && cur.value === 'auto')
      delete root.dataset[name] // Auto is no attribute, whatever the page's <html> says
    if (cur && (r || (IS_STD.has(name) && !(AUTO_REMOVES.has(name) && cur.value === 'auto'))))
      apply(name, cur.value, { later: true })
  }
  summary()
  // attributes are written now (no flash); the events wait until the page's own scripts are listening
  const flush = () => initial.splice(0).forEach(([n, v]) => emit(n, v))
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', flush)
  else setTimeout(flush)
  bar.addEventListener('change', (e) => {
    const g = e.target.closest('[data-ctl]')
    if (g && e.target.name === g.dataset.ctl) apply(g.dataset.ctl, e.target.value, { user: true })
  })

  // ---- the sheet (below 1024px) and the More popover (1024px and up): disclosures, Esc and outside tap close
  const toggle = bar.querySelector('.wb-toggle'),
    more = bar.querySelector('.wb-more'),
    moreBtn = bar.querySelector('.wb-more-btn')
  const wide = matchMedia('(min-width: 1024px)')
  const firstInput = (scope) =>
    scope.querySelector('input:checked') || scope.querySelector('input, button, a[href]')
  const openSheet = (on, focus = true) => {
    bar.toggleAttribute('data-open', on)
    toggle.setAttribute('aria-expanded', on)
    if (on && focus) firstInput(bar.querySelector('.wb-sheet'))?.focus()
    else if (!on && focus && bar.contains(document.activeElement)) toggle.focus()
  }
  const openMore = (on, focus = true) => {
    if (!more) return
    more.toggleAttribute('data-open', on)
    moreBtn.setAttribute('aria-expanded', on)
    if (on) {
      const pop = more.querySelector('.wb-extras')
      pop.removeAttribute('data-align')
      if (pop.getBoundingClientRect().left < 8) pop.dataset.align = 'start'
      if (focus) firstInput(pop)?.focus()
    } else if (focus && more.contains(document.activeElement)) moreBtn.focus()
  }
  toggle.addEventListener('click', () => openSheet(!bar.hasAttribute('data-open')))
  bar.addEventListener('click', (e) => {
    if (e.target.closest('.wb-sheet a[href]')) {
      openSheet(false, false)
      openMore(false, false)
    }
  }) // a links extra navigates
  moreBtn?.addEventListener('click', () => openMore(!more.hasAttribute('data-open')))
  more?.addEventListener('focusout', (e) => {
    if (
      wide.matches &&
      more.hasAttribute('data-open') &&
      e.relatedTarget &&
      !more.contains(e.relatedTarget)
    )
      openMore(false, false)
  })
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return
      if (more?.hasAttribute('data-open') && wide.matches) {
        openMore(false)
        e.stopPropagation()
      } else if (bar.hasAttribute('data-open')) openSheet(false)
    },
    true,
  )
  document.addEventListener('pointerdown', (e) => {
    if (bar.hasAttribute('data-open') && !bar.contains(e.target)) openSheet(false, false)
    if (more?.hasAttribute('data-open') && !more.contains(e.target)) openMore(false, false)
  })
  wide.addEventListener('change', () => {
    openSheet(false, false)
    openMore(false, false)
  })

  // the bar's height, for anything that docks under it (sticky sub-navs, scroll padding)
  new ResizeObserver(() => root.style.setProperty('--wb-h', bar.offsetHeight + 'px')).observe(bar)

  api.set = (name, value, { url = true, animate = true } = {}) => {
    const r = bar.querySelector(`input[name="${name}"][value="${CSS.escape(String(value))}"]`)
    if (r) {
      r.checked = true
      apply(name, r.value, { user: animate, url })
    }
  }
  api.get = (name) => checked(name)?.value
  window.warpBar = api
})()
