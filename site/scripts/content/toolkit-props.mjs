// ------------------------------------------------------------------ toolkit

/** What the common props mean, so a table isn't blank where the source has no comment. A Doc's `propDocs` wins. */

const PROP_WORDS = {
  children: 'What it contains.',
  label: 'Its accessible name. Fields show it; icon-only controls speak it.',
  hint: 'One line of help under the control.',
  error: 'A message that marks the field invalid and says why.',
  value: 'The current value, when you own the state.',
  defaultValue: 'The starting value, when the component owns the state.',
  defaultChecked: 'Starts checked.',
  checked: 'Whether it is on.',
  onChange: 'Called with the new value.',
  onInput: 'Called on each keystroke.',
  onClick: 'Called when pressed.',
  onSelect: 'Called with what was picked.',
  onClose: 'Called after it closes.',
  onOpen: 'Called after it opens.',
  open: 'A state box that holds whether it is open.',
  disabled: 'Turns it off, and takes it out of the tab order.',
  readOnly: 'Shows the value but does not let it change.',
  required: 'The form will not submit without it.',
  name: 'The name it posts under in a form.',
  id: 'The element id. One is made for you if you leave it out.',
  placeholder: 'Sample text shown while empty. Never a substitute for a label.',
  tone: 'What it means: neutral, accent, positive, caution, critical or info.',
  size: 'Control size. `md` by default.',
  emphasis: 'How loud it is.',
  icon: 'An icon name from `@kerf/veneer-icons`, or a component.',
  title: 'The heading.',
  description: 'One supporting line under the title.',
  footer: 'What sits at the bottom, usually actions.',
  options: 'What can be picked.',
  items: 'The rows it shows.',
  rows: 'The data, one object per row.',
  columns: 'One definition per column.',
  caption: 'Names the table for screen readers.',
  data: 'The series to draw.',
  format: 'Turns a value into the text shown.',
  min: 'The lowest allowed value.',
  max: 'The highest allowed value.',
  step: 'How far one key press moves it.',
  loading: 'Shows that work is under way.',
  full: 'Takes the whole width of its container.',
  side: 'Which edge it sits on.',
  align: 'How it lines up with what opened it.',
  placement: 'Where it opens relative to what opened it.',
  height: 'Its height, in pixels.',
  width: 'Its width.',
  ratio: 'Width to height.',
  gap: "The space between children, from veneer's space scale.",
  as: 'The element it renders as.',
  variant: 'Which form it takes.',
  count: 'The number it shows.',
  locale: 'The language and region used to format values.',
  href: 'Where it links.',
  ui: 'A row from `interaction()`, which it fills and draws.',
  onSubmit: 'Called with the values when submitted.',
  onSave: 'Called with the result when saved.',
  onCancel: 'Called when dismissed.',
  onDelete: 'Called when deleted.',
  onRemove: 'Called when removed.',
}
const HIDDEN_PROPS = new Set(['ui', 'ref', 'class', 'style', 'key'])
/** Plain headings for what the group files call an example. */
const PLAIN = {
  Emphasis: 'Variants',
  'Label and line styles': 'Variants',
  'Label styles': 'Variants',
  Tone: 'Tones',
  'With an icon': 'Icons',
  'With icons': 'Icons',
  'Types and icons': 'With icon',
  'Every state': 'States',
  'Each state': 'States',
  'Off, on and disabled': 'States',
  'Empty, hint and invalid': 'States',
  'Empty, filled, hint and invalid': 'States',
  'Empty, filled and disabled': 'States',
  'Live check': 'Validation',
  'Hint and error': 'Validation',
  Align: 'Alignment',
  'A short form': 'With form',
}
const plainTitle = (t) => PLAIN[t] ?? t
/**
 * A component page's order, the same everywhere: one preview, then an H2 per real option, simplest first. Examples in a
 * generic section ("Variants", "In context") each become their own H2; a named section, like Placement, keeps its
 * examples together under it. A group's file can name the opening preview with `hero`.
 */
function arrange(doc) {
  const shown = doc.sections.filter((s) => s.kind !== 'prose')
  const by = (kind) => shown.filter((s) => s.kind === kind).flatMap((s) => s.examples)
  const hero = doc.hero
    ? { id: doc.hero, ...shown.flatMap((s) => s.examples).find((e) => e.id === doc.hero) }
    : (by('variants')[0] ?? by('composition')[0] ?? by('states')[0])
  const generic = /^(Variants?|States?|In context|Examples?|Composition)$/
  const rank = { variants: 10, sizes: 11, states: 12, composition: 13, prose: 14 }
  const first = ['Placement', 'Alignment', 'Variants', 'Sizes', 'Tones']
  const weight = (s) => (first.includes(s.title) ? first.indexOf(s.title) : rank[s.kind])
  const parts = doc.sections
    .flatMap((s) => {
      if (s.kind === 'prose') return [s]
      const rest = s.examples.filter((e) => e.id !== hero?.id)
      if (!rest.length) return []
      if (!generic.test(s.title)) return [{ ...s, examples: rest }]
      return rest.map((e) => ({
        kind: /^sizes?$/i.test(e.title) ? 'sizes' : s.kind,
        title: plainTitle(e.title),
        intro: e.note,
        examples: [{ ...e, note: undefined }],
      }))
    })
    .sort((a, b) => weight(a) - weight(b))
  return { hero, parts }
}

/** The shortest thing that shows a component in use, for the Usage heading. */
function usageOf(doc, name, found, play) {
  const line = `import { ${name} } from '@kerf/veneer'`
  const from = play && !play.code.includes('{children}') ? null : play?.code
  const start = play && Object.fromEntries(play.knobs.map((k) => [k.prop, k.initial]))
  const kids = String(start?.children ?? '')
  if (from)
    return `${line}\n\n${(kids ? from : from.replace(/>\{children\}<\/[\w.]+>/, ' />')).replace('{props}', '').replace('{children}', () => kids)}`
  if (doc.usage) return `${line}\n\n${doc.usage}`
  const first = arrange(doc).hero,
    f = first && found.get(first.id)
  return f?.stateless && f.body.split('\n').length <= 10 ? `${line}\n\n${f.body}` : line
}

const SPEC_WORDS = /§|\bSIGNATURE\b|\bspecimen\b/
const GITHUB_SRC = 'https://github.com/Ravonus/kerf/blob/main/'

/** A prop's row: the prop's own comment, then the page's, then the common word, and never a spec reference. */
/** A default the words name, as in "`md` by default", when it's one of the prop's own values and not one case of several. */
const namedDefault = (p, words) => {
  const named = /`([^`]+)` by default(?! for)/.exec(words)?.[1]
  return named !== undefined && p.values?.map(String).includes(named)
    ? typeof p.values[0] === 'string'
      ? `'${named}'`
      : named
    : undefined
}
/** The default the source states, else the one the words name; an optional switch left out is off. */
const propDefault = (p, words) =>
  p.default ??
  namedDefault(p, words) ??
  (!p.required && !p.worked && p.type === 'boolean' ? 'false' : undefined)
const propRow = (p, doc) => {
  const words = (doc.propDocs?.[p.name] ?? cleanDoc(p.doc)) || PROP_WORDS[p.name] || ''
  return {
    name: p.name,
    type: p.type,
    required: p.required,
    default: propDefault(p, words),
    doc: words,
  }
}
const cleanDoc = (text) => {
  const said = text
    .replace(/\s*\((?:[^()]*§[^()]*|components\.html[^()]*)\)/g, '')
    .replace(/\s+\[?\d{2} §[\d.]+\]?/g, '')
    .trim()
  return SPEC_WORDS.test(said) ? '' : said
}

/** The most options a playground shows as one button each; past it, a dropdown. */
const FEW = 6
/** Knobs, finished from the type checker: options, the control that suits them, and the default the code compares against. */
function finishKnobs(play, props, where) {
  return {
    ...play,
    knobs: play.knobs.map((k) => {
      const p = props.find((x) => x.name === k.prop)
      if (!p && k.prop !== 'children' && !k.options && !k.control)
        throw new Error(`${where}: no prop ${k.prop}`)
      const options = k.options ?? p?.values
      // A choice is a button per option while there are few enough to read at a glance; a long list is a dropdown.
      const choice =
        options &&
        (k.control === 'select' ||
          k.control === 'segmented' ||
          (!k.control && p?.type !== 'boolean'))
      const control = choice
        ? options.length <= FEW
          ? 'segmented'
          : 'select'
        : (k.control ??
          (p?.type === 'boolean' ? 'switch' : p?.type === 'number' ? 'slider' : 'text'))
      const unquoted = p?.default?.replace(/^['"]|['"]$/g, '')
      const fallback =
        k.default !== undefined
          ? k.default
          : unquoted === 'true'
            ? true
            : unquoted === 'false'
              ? false
              : unquoted !== undefined && unquoted !== '' && !isNaN(+unquoted)
                ? +unquoted
                : unquoted
      const initial =
        k.initial !== undefined
          ? k.initial
          : fallback !== undefined
            ? fallback
            : control === 'switch'
              ? false
              : (options?.[0] ?? '')
      return {
        prop: k.prop,
        control,
        label:
          k.label ??
          (k.prop[0].toUpperCase() + k.prop.slice(1)).replace(
            /([a-z])([A-Z])/g,
            (_, a, b) => `${a} ${b.toLowerCase()}`,
          ),
        options,
        min: k.min,
        max: k.max,
        step: k.step,
        initial,
        default: fallback,
        when: k.when,
      }
    }),
  }
}

export { HIDDEN_PROPS, arrange, usageOf, SPEC_WORDS, GITHUB_SRC, propRow, finishKnobs }
