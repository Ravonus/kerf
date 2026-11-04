// weft SSR HTML → the React-element shape Satori takes ({ type, props: { style, children } }). Written for the spike
// instead of satori-html, which crashes under Bun 1.3 (ultrahtml's selector code) and trims the spaces around inline
// elements ("new <b>bold</b> and" → "newboldand"). It only has to read what weft's SSR writes: quoted attributes,
// void elements without a slash, no <style> or <script>, comments already removed.
const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])
const TAG = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*\/?>/g
const ATTR = /([^\s=]+)(?:="([^"]*)")?/g
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" }
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, e) => ENTITIES[e])
const camel = (k) =>
  k.replace(/^-webkit-/, 'Webkit-').replace(/-([a-z])/g, (_, c) => c.toUpperCase())

function style(text) {
  const out = {}
  for (const decl of text.split(';')) {
    const i = decl.indexOf(':')
    if (i > 0) out[camel(decl.slice(0, i).trim())] = decl.slice(i + 1).trim()
  }
  return out
}

function element(type, attrs) {
  const props = {}
  for (const [, name, value = ''] of attrs.matchAll(ATTR)) {
    const v = decode(value)
    props[name === 'class' ? 'className' : name] =
      name === 'style' ? style(v) : /^(width|height)$/.test(name) && /^\d+$/.test(v) ? Number(v) : v
  }
  return { type, props, kids: [] }
}

const finish = (n) => {
  const kids = n.kids
  delete n.kids
  if (kids.length) n.props.children = kids.length === 1 ? kids[0] : kids
  return n
}

export function htmlToVNode(html) {
  const root = element('div', '')
  root.props.style = { display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }
  const stack = [root]
  let last = 0
  const text = (s) => {
    if (s) stack.at(-1).kids.push(decode(s))
  }
  for (const m of html.matchAll(TAG)) {
    text(html.slice(last, m.index))
    last = m.index + m[0].length
    const [, close, name, attrs] = m
    if (close) {
      if (stack.length > 1) stack.at(-2).kids.push(finish(stack.pop()))
      continue
    }
    const node = element(name.toLowerCase(), attrs)
    if (VOID.has(node.type)) stack.at(-1).kids.push(finish(node))
    else stack.push(node)
  }
  text(html.slice(last))
  while (stack.length > 1) stack.at(-2).kids.push(finish(stack.pop()))
  return finish(root)
}
