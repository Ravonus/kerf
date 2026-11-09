// What `warp({ parts })` can restyle: each part's selector, its states, and where each property lands.
// One table drives the CSS (theme.mjs), the types (plugin.d.mts) and the docs (`weft docs theme`).

/** States a part can take. `&` in a part's selector is where the state goes. */
export const STATES = {
  hover: ':hover',
  focus: ':focus-visible',
  press: ':active',
  active:
    ':is([aria-current]:not([aria-current="false"]), [aria-selected="true"], [aria-pressed="true"], [data-state="on"])',
  open: ':is([aria-expanded="true"], [data-state="open"], [open])',
  disabled: ':is(:disabled, [aria-disabled="true"])',
}

/**
 * Properties every part takes. `kind` sets how a value is read: a colour (a name from `colors`, or any CSS colour), a
 * length (a number is px, a name from `system.space` or `system.radius`), a time (a number is ms), or a plain value.
 */
export const PROPS = {
  bg: { css: 'background-color', kind: 'color' },
  text: { css: 'color', kind: 'color' },
  border: { css: 'border-color', kind: 'color' },
  borderWidth: { css: 'border-width', kind: 'length' },
  radius: { css: 'border-radius', kind: 'radius' },
  padding: { css: 'padding', kind: 'space' },
  paddingX: { css: 'padding-inline', kind: 'space' },
  paddingY: { css: 'padding-block', kind: 'space' },
  gap: { css: 'gap', kind: 'space' },
  margin: { css: 'margin', kind: 'space' },
  height: { css: 'block-size', kind: 'length' },
  minHeight: { css: 'min-block-size', kind: 'length' },
  width: { css: 'inline-size', kind: 'length' },
  size: { css: ['inline-size', 'block-size'], kind: 'length' },
  shadow: { css: 'box-shadow', kind: 'shadow' },
  opacity: { css: 'opacity', kind: 'plain' },
  scale: { css: 'scale', kind: 'plain' },
  duration: { css: 'transition-duration', kind: 'time' },
  easing: { css: 'transition-timing-function', kind: 'ease' },
  font: { css: 'font-family', kind: 'font' },
  fontSize: { css: 'font-size', kind: 'length' },
  weight: { css: 'font-weight', kind: 'plain' },
  leading: { css: 'line-height', kind: 'plain' },
  tracking: { css: 'letter-spacing', kind: 'length' },
  case: { css: 'text-transform', kind: 'plain' },
}

// A solid control paints its fill and hover from tone channels, never `background` alone: a part that sets these
// moves the channels, so the hover wash, the vivid pull-out and the sweep all follow. Tones set by markup win.
// `hover.bg` is the hover channel at rest (the wash animates to it), not a second fill under :hover. A solid's text is
// its on-fill ink; every other emphasis draws its text in the tone's text colour.
const channels = (sel, solid) => ({
  bg: {
    vars: ['--_solid'],
    on: `${sel}:not([data-tone])`,
    kind: 'color',
    hover: { vars: ['--_solid-hover'] },
  },
  text: {
    vars: solid ? ['--_ink-on', '--_ink'] : ['--_text', '--_ink'],
    on: `${sel}:not([data-tone])`,
    kind: 'color',
  },
  border: { vars: ['--_edge', '--_border'], on: `${sel}:not([data-tone])`, kind: 'color' },
})
const EMPHASES = ['soft', 'outline', 'ghost', 'frame', 'link']
const emphasis = (e) => {
  const sel = `[data-scope="button"][data-emphasis="${e}"]&`
  return { sel, props: { ...channels(sel, false) } }
}

const sweepHost = { radius: { css: ['border-radius', '--warp-sweep-radius'], kind: 'radius' } }

/**
 * The parts. `for` names the components a part styles (their docs pages list it). `sel` is the element (with `&` where
 * a state attaches); `props` adds or replaces properties; `states` limits the states (all by default). `sub` names inner pieces, each a part of its own (`nav.underline`).
 */
export const PARTS = {
  button: {
    about: 'Button and ButtonLink',
    for: ['Button'],
    sel: '[data-scope="button"]&',
    props: { ...channels('[data-scope="button"]:not([data-emphasis])&', true), ...sweepHost },
    sub: Object.fromEntries(EMPHASES.map((e) => [e, emphasis(e)])),
  },
  iconButton: {
    about: 'A button that holds only an icon (copy, close, menu): square by default',
    for: ['Button'],
    sel: '[data-scope="button"][data-icon-only]&',
    props: { ...sweepHost, icon: { css: '--warp-icon-md', kind: 'length' } },
  },
  copy: { about: 'CopyButton', for: ['CodeBlock'], sel: '[data-copy]&', props: sweepHost },
  close: {
    about: 'The close button of a dialog, sheet, drawer, alert or side nav',
    for: ['Modal', 'Drawer', 'Alert', 'SideNav'],
    sel: '[data-part="close"]&',
  },
  link: {
    about: 'Link: the text link with the drawn underline',
    for: ['Link'],
    sel: 'a[data-scope="link"]&',
    sub: {
      underline: {
        sel: 'a[data-scope="link"]&',
        states: ['hover', 'focus'],
        props: {
          color: { css: 'text-decoration-color', kind: 'color' },
          width: { css: 'text-decoration-thickness', kind: 'length' },
          offset: { css: 'text-underline-offset', kind: 'length' },
        },
      },
    },
  },
  nav: {
    about: 'Nav: the row or column of links with the sliding bar',
    for: ['Nav', 'SideNav'],
    sel: '[data-scope="nav"]&',
    states: [],
    sub: {
      item: { sel: '[data-scope="nav"] a&' },
      underline: {
        sel: '[data-scope="nav"] > [data-part="indicator"]&',
        states: [],
        props: {
          color: { css: 'background-color', kind: 'color' },
          width: { vars: ['--_bar'], on: '[data-scope="nav"]', kind: 'length' },
          duration: { css: 'transition-duration', kind: 'time' },
        },
      },
    },
  },
  tabs: {
    about: 'Tabs',
    for: ['Tabs'],
    sel: '[data-scope="tabs"] > [data-part="list"]&',
    states: [],
    sub: {
      tab: {
        sel: '[data-scope="tabs"] > [data-part="list"] > [data-part="trigger"]&',
        props: sweepHost,
      },
      underline: {
        sel: '[data-scope="tabs"] > [data-part="list"] > [data-part="indicator"]&',
        states: [],
        props: {
          color: { css: 'background-color', kind: 'color' },
          width: { css: 'block-size', kind: 'length' },
        },
      },
    },
  },
  pill: { about: 'Pill and PillLink', sel: '[data-scope="pill"]&', props: sweepHost },
  badge: { about: 'Badge', for: ['Badge'], sel: '[data-scope="badge"]&' },
  chip: { about: 'Chip', for: ['Chip'], sel: '[data-scope="chip"]&', props: sweepHost },
  card: { about: 'Card and Surface', for: ['Card'], sel: '[data-scope="surface"]&' },
  field: {
    about: 'Text fields, selects and pickers',
    for: ['Field', 'Textarea', 'Search', 'Select', 'NumberField', 'DateField', 'TimeField'],
    sel: '[data-scope="field"] > [data-part="control"]&',
    props: { bg: { vars: ['--warp-color-field'], kind: 'color' }, ...sweepHost },
    sub: {
      label: {
        sel: '[data-scope="field"] [data-part="label"]&',
        states: ['hover', 'focus'],
        props: {
          // at rest, and while the sweep runs (hover and focus share one colour: the label lights with the stroke)
          text: {
            vars: ['--warp-color-label', '--warp-color-label-rest'],
            on: '[data-scope="field"]',
            kind: 'color',
            hover: { vars: ['--warp-color-label-active'] },
            focus: { vars: ['--warp-color-label-active'] },
          },
        },
      },
    },
  },
  sweep: {
    about:
      'The sweep: the stroke that draws round a control on hover and focus, and the text while it runs',
    sel: ':root&',
    states: [],
    props: {
      stroke: { vars: ['--warp-color-sweep'], kind: 'color', scope: true },
      base: { vars: ['--warp-color-sweep-base'], kind: 'color', scope: true },
      text: { vars: ['--warp-color-label-active'], kind: 'color', scope: true },
      width: { vars: ['--warp-sweep-width'], kind: 'length', scope: true },
      duration: { vars: ['--warp-ref-sweep', '--warp-ref-frame'], kind: 'time', scope: true },
    },
  },
  dialog: {
    about: 'Modal and Dialog',
    for: ['Modal'],
    sel: 'dialog[data-scope="dialog"]&',
    states: [],
  },
  sheet: {
    about: 'Sheet and Drawer',
    for: ['Drawer'],
    sel: 'dialog[data-scope="sheet"]&',
    states: [],
  },
  popover: {
    about: 'Popover, Menu and Tooltip panels',
    for: ['Popover', 'Menu', 'Tooltip'],
    sel: ':is([data-scope="popover"], [data-scope="menu"], [data-scope="tooltip"])&',
    states: [],
  },
  toast: { about: 'Toast', for: ['Toast'], sel: '[data-scope="toast"]&', states: [] },
}

/** Every part, sub-parts included, as `[path, spec]` with `path` like `nav.underline`. */
export function allParts() {
  const out = []
  for (const [name, spec] of Object.entries(PARTS)) {
    out.push([name, spec])
    for (const [sub, inner] of Object.entries(spec.sub ?? {})) out.push([`${name}.${sub}`, inner])
  }
  return out
}

/** A part's properties: the shared ones, then its own (which replace a shared one of the same name). */
export const propsOf = (spec) => ({ ...PROPS, ...spec.props })
/** The states a part takes. */
export const statesOf = (spec) => spec.states ?? Object.keys(STATES)
