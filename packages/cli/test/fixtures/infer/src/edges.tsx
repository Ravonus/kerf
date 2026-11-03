import { state } from '@weft-js/core'
import { Card, Shared } from './card'

function Button(props: { onClick?: (e: MouseEvent) => void; label: string; variant?: 'a' | 'b' }) { return <button onClick={props.onClick}>{props.label}</button> }

// spread forwarding
function Save(props) { return <Button {...props} variant="a" /> }
function Rest({ title, ...rest }) { return <div><h1>{title}</h1><Button {...rest} /></div> }

// optional when some caller omits, default value
function Opt({ a, b, size = 3 }) { return <p>{a}{b}{size}</p> }

// union handled by body
function Show(props) { return <p>{String(props.v)}</p> }

// conflict: body only takes number, odd caller
function Inc(props) { return <button onClick={() => props.n++}>+</button> }

// children render function, call-derived arg
function List(props) { return <ul>{props.items.map(i => props.children(i))}</ul> }

// forwarded through an inferred component
function Outer(props) { return <Inner x={props.x} /> }
function Inner(props) { return <b>{props.x.toFixed(1)}</b> }

// recursive
interface TreeNode { v: number; next?: TreeNode }
const tree: TreeNode = { v: 1 }
function Tree(props) { return <li>{props.node.v}{props.node.next ? <Tree node={props.node.next} /> : null}</li> }

// components as values
function A(props) { return <i>{props.x}</i> }
function B(props) { return <b>{props.x}</b> }
const pick = <T,>(a: T, b: T) => (Math.random() > 0.5 ? a : b)
const views = { a: A, b: B }
function Host(props) { const Icon = props.icon; return <Icon size={3} /> }
function Star(props) { return <i>{props.size * 2}</i> }

// HOC
const hoc = <P,>(C: (p: P) => any) => (p: P) => C(p)
function Plain(props) { return <u>{props.t}</u> }
const Wrapped = hoc(Plain)

// any source
const raw = JSON.parse('{}')
function Weak(props) { return <p>{props.data}</p> }
function Cb(props) { return <p onClick={() => props.f(1)}>{props.g.length}</p> }

// async
async function Slow(props) { return <p>{props.ms + 1}</p> }

// literal union
function Tab(props) { return <a class={props.kind === 'one' ? 'x' : 'y'}>t</a> }

// conditional props: the body narrows on `kind`
function Field(props) { return props.kind === 'num' ? <b>{props.value.toFixed(props.digits)}</b> : <i>{props.value.toUpperCase()}</i> }

function Unused(props) { return <p>{props.a}</p> }

export default function Page() {
  const n = state(1)
  const C = pick(A, B)
  const V = views.a
  interface Local { q: number }
  const loc: Local = { q: 1 }
  function Closure(props) { return <p>{n.value + props.d}</p> }
  function UsesLocal(props) { return <p>{props.l.q}</p> }
  return <div>
    <Save label="s" />
    <Rest title="t" label="l" />
    <Opt a={1} /><Opt a={2} b="x" size={4} />
    <Show v={1} /><Show v="s" />
    <Inc n={1} /><Inc n={2} /><Inc n="no" />
    <List items={[1, 2]}>{i => <li>{i}</li>}</List>
    <Outer x={1.5} />
    <Tree node={tree} />
    <C x={1} /><V x={2} />
    <Host icon={Star} />
    <Wrapped t="w" />
    <Weak data={raw} />
    <Cb f={x => x + 1} g={raw} />
    <Slow ms={1} />
    <Tab kind="one" /><Tab kind="two" />
    <Field kind="text" value="a" /><Field kind="num" value={1} digits={2} />
    <Closure d={1} />
    <UsesLocal l={loc} />
    <Card title="c" /><Shared n={1} />
  </div>
}
