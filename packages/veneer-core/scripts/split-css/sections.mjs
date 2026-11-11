import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { items, body, scopesOf } from './parse.mjs'

// marker text → file. Anything not named here gets a slug from its first words.
const NAMES = {
  frame: 'button',
  'Badge + status dot': 'badge',
  'Alert (inline), Banner (page), Callout (prose)': 'alert',
  'Select-like listbox': 'listbox',
  'Toggle button / toggle group': 'toggle-button',
  'Copy action': 'copy',
  'Modal backdrop as a part': 'dialog',
  'Command palette': 'command-palette',
  'Context menu target': 'menu',
  'Hover card': 'popover',
  'Skeleton scope': 'skeleton',
  'Number / relative time': 'number',
  'Avatar + avatar group': 'avatar',
  'Empty / error state': 'empty-state',
  'Accordion / disclosure': 'accordion',
  'Theme toggle': 'theme-toggle',
  'Live status': 'live-status',
  'Icon gallery': 'icon',
  'Item row': 'item-row',
  'Status light': 'status-light',
  'Section message': 'section-message',
  'Highlight / mark': 'highlight',
  'Speed dial': 'speed-dial',
  'Selection toolbar': 'selection-toolbar',
  'Tour step': 'tour',
  'AI label': 'ai-label',
  'Theme panel': 'theme-panel',
  'QR code': 'qr-code',
  'Stopwatch / elapsed timer': 'countdown',
  'Countdown timer': 'countdown',
  'Meta list': 'meta-list',
  'Button group': 'button-group',
  'appearance: line': 'field',
}
const SECTIONS = {
  // numbered section headers (inputs) → file
  'THE SWEEP ON INPUT': 'field',
  'THE FIELD, EXTENDED FOR INPUTS': 'field',
  'TEXT FAMILY EXTRAS': 'text',
  'CHOICE FAMILY': 'choice',
  'POPUP + LISTBOX': 'listbox',
  'RANGE FAMILY': 'range',
  'FILE FAMILY': 'file',
  'FORM LAYOUT': 'form',
  'MORE PICKERS AND FORM MECHANICS': 'pickers',
}
const TAIL = /^(Reduced motion|forced colours|TOUCH TARGETS)/
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export function split(spec, file, family) {
  const css = readFileSync(join(spec, file), 'utf8')
  const { layer, list } = items(css)
  const files = new Map() // name → items
  const owner = new Map() // data-scope → file that first styles it
  const tail = []
  let current = 'base',
    inTail = false
  for (const item of list) {
    if (item.kind === 'comment') {
      const note = item.text.slice(2, -2).trim()
      const marker = note.match(/^-- +([^-\n][^\n]*)/)
      const section =
        note.match(/^[-=]{8,}\s*\n\s*(?:\d+|[A-Z]) · ([^\n.(]*)/) ??
        note.match(/^[-=]{8,}\s*([A-Z][A-Z ]+)/) ??
        note.match(/^-{8,}\s*(forced colours)/)
      const title = marker?.[1].replace(/[-\s*/]+$/, '') ?? section?.[1].trim()
      if (title && TAIL.test(title)) inTail = true
      else if (marker && !inTail) {
        const named = Object.keys(NAMES).find(
          (k) =>
            title === k ||
            title.startsWith(`${k}:`) ||
            title.startsWith(`${k} (`) ||
            title.startsWith(`${k}.`),
        )
        current = named ? NAMES[named] : slug(title.split(/[(:,.+/—]| - /)[0])
      } else if (section && !inTail) {
        const key = Object.keys(SECTIONS).find((k) => title.startsWith(k))
        if (key) current = SECTIONS[key]
      }
    }
    if (inTail) {
      tail.push(item)
      continue
    }
    if (!files.has(current)) files.set(current, [])
    files.get(current).push(item)
    if (item.kind === 'rule' && current !== 'base')
      for (const s of scopesOf(item.text)) if (!owner.has(s)) owner.set(s, current)
  }
  const shared = placeTail(files, owner, tail)
  return { layer, family, files, shared }
}

function placeTail(files, owner, tail) {
  // Tail rules follow the component they restate (comments and space ride with the next rule). A rule naming several
  // components' scopes is copied to each: these are final overrides, so a second identical copy changes nothing.
  // An @media block is split the same way, each owner getting its own copy of the wrapper.
  const shared = []
  const homesOf = (text) => {
    const owners = new Set(
      scopesOf(text)
        .map((s) => owner.get(s))
        .filter(Boolean),
    )
    return owners.size ? [...owners] : ['base']
  }
  const place = (home, rules) =>
    (home === 'base' ? shared : files.get(home)).push({ kind: 'space', text: '\n' }, ...rules)
  let pending = []
  for (const item of tail) {
    if (item.kind !== 'rule') {
      pending.push(item)
      continue
    }
    if (/^@media|^@supports/.test(item.text)) {
      const open = item.text.indexOf('{') + 1
      const inner = body(item.text, open).list
      const byHome = new Map()
      let before = []
      for (const i of inner) {
        if (i.kind !== 'rule') {
          before.push(i)
          continue
        }
        for (const h of homesOf(i.text))
          (byHome.get(h) ?? byHome.set(h, []).get(h)).push(...before, i)
        before = []
      }
      for (const [h, rules] of byHome)
        place(h, [
          ...pending,
          {
            kind: 'rule',
            text: `${item.text.slice(0, open)}\n${rules
              .map((i) => i.text)
              .join('')
              .trim()}\n}`,
            inner: rules.filter((i) => i.kind === 'rule').map((i) => i.text),
          },
        ])
    } else for (const h of homesOf(item.text)) place(h, [...pending, item])
    pending = []
  }
  return shared
}
