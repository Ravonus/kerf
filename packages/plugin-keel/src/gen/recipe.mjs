// The gen recipe (`keel-gen@1`) and its style bible (`keel-style@1`): closed vocabularies, checked all at once so an
// agent sees every problem in one pass, each with its JSON path.

export const OPS = ['make', 'over', 'control', 'animate', 'loop']
const ON = /^(?:id:[a-z0-9][\w.-]*|depth|normal|line|block|light)$/i
const FIELDS = [
  'op',
  'on',
  'says',
  'out',
  'fit',
  'n',
  'calls',
  'seed',
  'via',
  'size',
  'from',
  'params',
]
const STYLE_TEXT = ['manner', 'avoid', 'light']
const MAX_WORDS = 25
const MAX_SIDE = 4096

// Names of image models and tools: `says` describes a manner, never whose tool made it.
const TOOLS = [
  'midjourney',
  'dall-e',
  'dalle',
  'stable diffusion',
  'sdxl',
  'imagen',
  'gemini',
  'openai',
  'chatgpt',
  'gpt-image',
  'firefly',
  'ideogram',
  'leonardo.ai',
  'sora',
  'kling',
  'comfyui',
  'photoshop',
  'procreate',
  'artstation',
]

const int = (text) => Number.parseInt(text, 10)
const side = (text) => int(text) >= 1 && int(text) <= MAX_SIDE
const OUT = {
  params: { re: /^params$/, ok: () => true },
  palette: { re: /^palette:(\d+)$/, ok: (m) => int(m[1]) >= 1 && int(m[1]) <= 256 },
  field: { re: /^field:(\d+)x(\d+)(?:x([1-4]))?$/, ok: (m) => side(m[1]) && side(m[2]) },
  residual: { re: /^residual:(\d+)x(\d+)$/, ok: (m) => side(m[1]) && side(m[2]) },
  tile: { re: /^tile:(\d+)(\+pbr)?$/, ok: (m) => side(m[1]) },
  stamps: { re: /^stamps:(\d+)@(\d+)$/, ok: (m) => side(m[1]) && side(m[2]) },
  curves: { re: /^curves:(\d+)$/, ok: (m) => int(m[1]) >= 1 && int(m[1]) <= 65535 },
  sparse: { re: /^sparse:(\d+)x(\d+)$/, ok: (m) => side(m[1]) && side(m[2]) },
  flow: { re: /^flow:(\d+)x(\d+)$/, ok: (m) => side(m[1]) && side(m[2]) },
  flip: { re: /^flip:(\d+)@(\d+)$/, ok: (m) => side(m[1]) && side(m[2]) },
}

/**
 * The bases an `out` string asks for, as `{ kind, args, pbr? }`, or `undefined` for a word it does not know:
 * `"palette:6 tile:128+pbr"` gives `[{ kind: 'palette', args: [6] }, { kind: 'tile', args: [128], pbr: true }]`.
 */
export function parseOut(out) {
  return out
    .trim()
    .split(/\s+/)
    .map((word) => {
      const kind = word.split(':')[0]
      const match = Object.hasOwn(OUT, kind) ? OUT[kind].re.exec(word) : null
      if (!match || !OUT[kind].ok(match)) return undefined
      const args = match
        .slice(1)
        .filter((group) => group !== undefined && group !== '+pbr')
        .map(int)
      return match[0].endsWith('+pbr') ? { kind, args, pbr: true } : { kind, args }
    })
}

/** The first term of `terms` in `text` as a whole word, ignoring case, or `undefined`. */
export function deniedTerm(text, terms) {
  return terms.find((term) => {
    const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return escaped && new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(text)
  })
}

const key = (name) => `[${JSON.stringify(name)}]`
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isInt = (value, min, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= min && value <= max

/** The problems in one slot's own fields. */
function slotProblems(slot, path) {
  const problems = []
  const bad = (field, message) => problems.push({ path: `${path}.${field}`, message })
  if (!isObject(slot)) return [{ path, message: 'a slot is an object' }]
  for (const field of Object.keys(slot))
    if (!FIELDS.includes(field)) bad(field, `unknown field; one of ${FIELDS.join(', ')}`)
  if (slot.op !== undefined && !OPS.includes(slot.op)) bad('op', `one of ${OPS.join(', ')}`)
  if (slot.on !== undefined) {
    const words = typeof slot.on === 'string' ? slot.on.trim().split(/\s+/) : [undefined]
    for (const word of words)
      if (typeof word !== 'string' || !ON.test(word))
        bad('on', `\`${word}\` is not a guide pass: id:<name>, depth, normal, line, block, light`)
  }
  if (slot.says !== undefined) {
    if (typeof slot.says !== 'string' || !slot.says.trim()) bad('says', 'a sentence of intent')
    else if (slot.says.trim().split(/\s+/).length > MAX_WORDS)
      bad('says', `at most ${MAX_WORDS} words`)
  }
  if (slot.out !== undefined) {
    const words = typeof slot.out === 'string' ? slot.out.trim().split(/\s+/) : []
    const parsed = typeof slot.out === 'string' ? parseOut(slot.out) : [undefined]
    parsed.forEach((out, i) => {
      if (!out) bad('out', `\`${words[i] ?? slot.out}\` is not a basis kind`)
    })
  }
  if (slot.fit !== undefined && !/^[a-z][\w-]*\.[a-z][\w-]*$/i.test(String(slot.fit)))
    bad('fit', 'a `<module>.<group>` name')
  if (slot.n !== undefined && !isInt(slot.n, 1, 4)) bad('n', 'a whole number, 1..4')
  if (slot.calls !== undefined && !isInt(slot.calls, 1)) bad('calls', 'a whole number from 1')
  if (slot.seed !== undefined && !Number.isSafeInteger(slot.seed)) bad('seed', 'an integer')
  if (slot.via !== undefined && !/^[a-z][a-z0-9-]*$/.test(String(slot.via)))
    bad('via', 'an adapter id')
  if (slot.size !== undefined) {
    const match = /^(\d+)x(\d+)$/.exec(String(slot.size))
    if (!match || !side(match[1]) || !side(match[2])) bad('size', 'like `1536x1024`')
  }
  if (slot.from !== undefined && typeof slot.from !== 'string') bad('from', 'a slot name')
  if (slot.params !== undefined && !isObject(slot.params)) bad('params', 'an object')
  return problems
}

/** The fields a slot still lacks after inheriting. */
function missing(slot, path) {
  const problems = ['op', 'says', 'out']
    .filter((field) => slot[field] === undefined)
    .map((field) => ({ path: `${path}.${field}`, message: 'missing' }))
  if ((slot.op === 'over' || slot.op === 'control') && slot.on === undefined)
    problems.push({ path: `${path}.on`, message: `missing: \`${slot.op}\` works on a guide` })
  return problems
}

/** Checks a style bible. Every problem at once, each with its path. */
export function checkStyle(style) {
  const problems = []
  const bad = (path, message) => problems.push({ path, message })
  if (!isObject(style))
    return { ok: false, problems: [{ path: '', message: 'a style is an object' }] }
  if (style.style !== 'keel-style@1') bad('style', 'must be `keel-style@1`')
  if (!Number.isSafeInteger(style.seed)) bad('seed', 'an integer')
  for (const field of STYLE_TEXT)
    if (typeof style[field] !== 'string' || !style[field].trim()) bad(field, 'a line of text')
  if (!isObject(style.palette)) bad('palette', 'an object of name → `#rrggbb`')
  else
    for (const [name, hex] of Object.entries(style.palette))
      if (!/^#[0-9a-f]{6}$/i.test(String(hex))) bad(`palette${key(name)}`, 'a `#rrggbb` colour')
  if (style.lib !== undefined) {
    if (!isObject(style.lib)) bad('lib', 'an object of name → slot')
    else
      for (const [name, slot] of Object.entries(style.lib)) {
        problems.push(...slotProblems(slot, `lib${key(name)}`))
        if (isObject(slot)) problems.push(...missing(slot, `lib${key(name)}`))
        if (isObject(slot) && slot.from !== undefined)
          bad(`lib${key(name)}.from`, 'a library slot does not inherit')
      }
  }
  if (style.via !== undefined && typeof style.via !== 'string') bad('via', 'an adapter id')
  return { ok: !problems.length, problems }
}

/** Where a slot's `from` points: a slot of this recipe, a library slot, or another recipe's (`file#slot`). */
function parentOf(name, recipe, style, resolveFrom) {
  const from = recipe.slots[name]?.from
  if (typeof from !== 'string') return { kind: 'none' }
  if (Object.hasOwn(recipe.slots, from)) return { kind: 'slot', name: from }
  if (isObject(style?.lib) && Object.hasOwn(style.lib, from))
    return { kind: 'lib', slot: style.lib[from] }
  if (from.includes('#')) {
    if (!resolveFrom) return { kind: 'bad', message: 'another recipe is not given here' }
    const slot = resolveFrom(from)
    return slot ? { kind: 'lib', slot } : { kind: 'bad', message: `no slot \`${from}\`` }
  }
  return { kind: 'bad', message: `no slot or library slot \`${from}\`` }
}

/** Slot names in dependency order (a parent before its children), and the problems found on the way. */
function order(recipe, style, resolveFrom) {
  const problems = []
  const done = new Set()
  const names = []
  const visit = (name, stack) => {
    if (done.has(name)) return
    if (stack.includes(name)) {
      const cycle = [...stack.slice(stack.indexOf(name)), name].join(' → ')
      problems.push({ path: `slots${key(name)}.from`, message: `a cycle: ${cycle}` })
      for (const member of stack.slice(stack.indexOf(name))) done.add(member)
      return
    }
    const parent = parentOf(name, recipe, style, resolveFrom)
    if (parent.kind === 'bad')
      problems.push({ path: `slots${key(name)}.from`, message: parent.message })
    if (parent.kind === 'slot') visit(parent.name, [...stack, name])
    if (done.has(name)) return
    done.add(name)
    names.push(name)
  }
  for (const name of Object.keys(recipe.slots)) visit(name, [])
  return { names, problems }
}

/** A denied term in a slot's `says`: the deny list's, or the name of an image model or tool. */
function saysProblem(slot, path, deny, bad) {
  const term = typeof slot?.says === 'string' && deniedTerm(slot.says, [...deny, ...TOOLS])
  if (term) bad(`${path}.says`, `denied term \`${term}\``)
}

const bare = (slot) =>
  isObject(slot)
    ? Object.fromEntries(Object.entries(slot).filter(([field]) => field !== 'from'))
    : {}

/** Each slot with its parent's fields under its own, without the defaults. */
function inherited(recipe, style, resolveFrom, names) {
  const merged = {}
  for (const name of names) {
    const own = recipe.slots[name]
    const parent = parentOf(name, recipe, style, resolveFrom)
    const base =
      parent.kind === 'slot' ? merged[parent.name] : parent.kind === 'lib' ? parent.slot : {}
    merged[name] = { ...bare(base), ...bare(own) }
  }
  return merged
}

/**
 * Checks a recipe against its style and a deny list (whole words, any case) laid over `says` and the style's text.
 * Every problem at once, each with its JSON path. `resolveFrom(ref)` gives another recipe's slot for `file#slot`.
 */
export function checkRecipe(recipe, { style, deny = [], resolveFrom } = {}) {
  const problems = []
  const bad = (path, message) => problems.push({ path, message })
  if (!isObject(recipe))
    return { ok: false, problems: [{ path: '', message: 'a recipe is an object' }] }
  if (recipe.gen !== 'keel-gen@1') bad('gen', 'must be `keel-gen@1`')
  if (typeof recipe.style !== 'string') bad('style', 'the path of a style bible')
  if (recipe.guide !== undefined && typeof recipe.guide !== 'string') bad('guide', 'a path')
  if (style !== undefined) {
    for (const problem of checkStyle(style).problems)
      bad(problem.path ? `style.${problem.path}` : 'style', problem.message)
    for (const field of STYLE_TEXT) {
      const term = typeof style?.[field] === 'string' && deniedTerm(style[field], deny)
      if (term) bad(`style.${field}`, `denied term \`${term}\``)
    }
    for (const [name, slot] of Object.entries(isObject(style?.lib) ? style.lib : {}))
      saysProblem(slot, `style.lib${key(name)}`, deny, bad)
  }
  if (!isObject(recipe.slots) || !Object.keys(recipe.slots).length) {
    bad('slots', 'an object of name → slot, with at least one')
    return { ok: false, problems }
  }
  for (const [name, slot] of Object.entries(recipe.slots)) {
    problems.push(...slotProblems(slot, `slots${key(name)}`))
    saysProblem(slot, `slots${key(name)}`, deny, bad)
  }
  const sorted = order(recipe, style, resolveFrom)
  problems.push(...sorted.problems)
  if (!sorted.problems.length) {
    const merged = inherited(recipe, style, resolveFrom, sorted.names)
    for (const name of sorted.names) problems.push(...missing(merged[name], `slots${key(name)}`))
  }
  return { ok: !problems.length, problems }
}

/**
 * The recipe's slots, fully defaulted (`n` 1, `calls` 1, the style's `seed` and `via`), in dependency order.
 * Throws with every problem when the recipe does not check.
 */
export function resolveSlots(recipe, style, { deny = [], resolveFrom } = {}) {
  const checked = checkRecipe(recipe, { style, deny, resolveFrom })
  if (!checked.ok)
    throw new Error(
      `keel gen: the recipe has problems:\n${checked.problems.map((p) => `  ${p.path}: ${p.message}`).join('\n')}`,
    )
  const { names } = order(recipe, style, resolveFrom)
  const merged = inherited(recipe, style, resolveFrom, names)
  return names.map((name) => {
    const slot = merged[name]
    const via = slot.via ?? style.via
    return {
      name,
      n: 1,
      calls: 1,
      seed: style.seed,
      on: '',
      ...slot,
      ...(via === undefined ? {} : { via }),
    }
  })
}
