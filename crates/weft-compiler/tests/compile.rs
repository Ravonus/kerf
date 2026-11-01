use weft_compiler::project::{FileView, link_w014};
use weft_compiler::{Diagnostic, Options, Severity, compile};

fn run(source: &str) -> (String, Vec<Diagnostic>) {
    let out = compile(source, &Options { filename: "App.tsx".into(), ..Default::default() });
    (out.code.unwrap_or_default(), out.diagnostics)
}

fn codes(d: &[Diagnostic]) -> Vec<&'static str> {
    d.iter().map(|d| d.code).collect()
}

/// Apply a diagnostic's autofix edits to the source.
fn apply_fix(source: &str, d: &Diagnostic) -> String {
    let mut edits = d.fix.as_ref().expect("fix").edits.clone();
    edits.sort_by_key(|e| std::cmp::Reverse(e.start));
    let mut out = source.to_string();
    for e in edits {
        out.replace_range(e.start as usize..e.end as usize, &e.text);
    }
    out
}

// ---- §3.3 props ------------------------------------------------------------------------------------------------

#[test]
fn destructured_props_become_live_reads() {
    let (code, d) = run("export function A({ a, b }: { a: number; b: string }) { return <p title={b}>{a}</p> }");
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("export function A(props: {"), "{code}");
    assert!(code.contains("props.a") && code.contains("props.b"), "{code}");
}

#[test]
fn defaults_apply_on_every_read() {
    let (code, _) = run("export const A = ({ size = 'md' }) => <p class={size} />");
    assert!(code.contains(r#"props.size === undefined ? "md" : props.size"#), "{code}");
}

#[test]
fn defaults_that_read_other_props_are_rewritten() {
    let (code, d) = run("export function A({ a, b = a, c = b + 1 }) { return <p title={c}>{b}</p> }");
    assert!(d.is_empty(), "defaults are live reads, not setup reads: {d:?}");
    assert!(code.contains("props.b === undefined ? props.a : props.b"), "{code}");
    assert!(code.contains("props.c === undefined ? (props.b === undefined ? props.a : props.b) + 1 : props.c"), "{code}");
    assert!(!code.contains(" a ") && !code.contains("(a)"), "no unbound `a` left: {code}");
}

#[test]
fn defaults_keep_list_and_box_reads_live() {
    let (code, d) = run("import { state } from 'weft'; const on = state(1); export function A({ n = on.value }) { return <p>{n}</p> }");
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("props.n === undefined ? on.value : props.n"), "{code}");
}

#[test]
fn rest_props_stay_live() {
    // on an element: a plain copy, read by the element's one spread binding (no view, no merged object)
    let (code, _) = run("export function A({ a, ...rest }) { return <div {...rest}>{a}</div> }");
    assert!(code.contains(r#"import { restOf as _$restOf } from "weft""#), "{code}");
    assert!(code.contains(r#"_$spread(_e1, () => ({ ..._$restOf(props, ["a"]) }))"#), "{code}");
    assert!(!code.contains("_$omit") && !code.contains("_$mergeProps"), "{code}");
    // passed on as a value: one live view
    let (code, _) = run("export function A({ a, ...rest }) { return <B {...rest} a={a} /> }");
    assert!(code.contains(r#"const _rest = _$omit(props, ["a"])"#), "{code}");
    assert!(code.contains("_$mergeProps(_rest, "), "{code}");
}

#[test]
fn element_spreads_read_their_attributes_in_order() {
    let (code, _) = run("export function A(props: any) { return <a title=\"t\" {...props.attrs} href={props.href} {...props}>x</a> }");
    assert!(code.contains(r#"_$spread(_e1, () => ({ title: "t", ...props.attrs, href: props.href, ...props }))"#), "{code}");
    // without JSX children, the merged props' `children` is the element's hole
    let (code, _) = run("export function A(props: any) { return <p {...props} /> }");
    assert!(code.contains("_$mergeProps(props)") && code.contains("() => _p2.children"), "{code}");
}

#[test]
fn props_object_form_is_left_alone() {
    let (code, d) = run("export function A(props: { a: number }) { return <p>{props.a}</p> }");
    assert!(d.is_empty());
    assert!(code.contains("props.a"));
}

#[test]
fn shorthand_properties_are_expanded() {
    let (code, _) = run("export function A({ a, f }) { return <button onClick={() => f({ a })}>x</button> }");
    assert!(code.contains("a: props.a"), "{code}");
}

#[test]
fn props_name_avoids_collisions() {
    let (code, _) = run("export function A({ a }) { const props = 1; return <p>{a + props}</p> }");
    assert!(code.contains("$props.a"), "{code}");
}

#[test]
fn w006_nested_destructuring_has_a_safe_fix() {
    let src = "export function A({ user: { name } }) { return <p>{name}</p> }";
    let (code, d) = run(src);
    assert_eq!(codes(&d), ["W006"]);
    assert!(code.contains("props.user.name"), "still compiled live: {code}");
    let fix = d[0].fix.as_ref().unwrap();
    assert!(fix.safe);
    let fixed = apply_fix(src, &d[0]);
    assert_eq!(fixed, "export function A({ user }) { return <p>{user.name}</p> }");
    assert!(run(&fixed).1.is_empty());
}

// ---- §3.3 children --------------------------------------------------------------------------------------------

#[test]
fn children_are_memoised_once_per_component() {
    let (code, d) = run("export function Box({ title, children }) { return <div><h2>{title}</h2>{children}{children}</div> }");
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains(r#"import { memo as _$weftMemo } from "weft""#), "{code}");
    assert_eq!(code.matches("_$weftMemo(() => props.children)").count(), 1, "{code}");
    assert_eq!(code.matches("_children").count(), 3, "one declaration, two reads: {code}");
    assert!(!code.contains("return props.children"), "no read bypasses the memo: {code}");
}

#[test]
fn children_memo_in_props_form_and_expression_arrows() {
    let (code, _) = run("export function P(props) { return <div>{props.children}</div> }");
    assert!(code.contains("const _children = _$weftMemo(() => props.children);"), "{code}");
    let (code, _) = run("export const Card = ({ children }) => <section>{children}</section>");
    assert!(code.contains("const _children = _$weftMemo(() => props.children);"), "the body becomes a block: {code}");
}

#[test]
fn children_memo_only_when_read() {
    let (code, _) = run("export function A({ children, a }) { return <p>{a}</p> }");
    assert!(!code.contains("_$weftMemo") && !code.contains("from \"weft\""), "{code}");
    let (code, _) = run("export function A({ children }) { const _children = 1; return <p>{children}{_children}</p> }");
    assert!(code.contains("const _children$ = _$weftMemo("), "avoids the name in use: {code}");
}

// ---- W016: call-expression props (§3.3) ------------------------------------------------------------------------

#[test]
fn w016_call_with_nothing_reactive_in_a_component_prop() {
    let (code, d) = run("render(() => <App api={createFakeApi()} />, root)");
    assert_eq!(codes(&d), ["W016"]);
    assert_eq!(d[0].severity, Severity::Warning);
    assert!(d[0].message.contains("`createFakeApi` runs again on every read of `api`"), "{}", d[0].message);
    assert!(d[0].fix.is_none(), "hoisting can't be proven safe without seeing inside the callee");
    assert!(code.contains("get api()"), "codegen is unchanged: {code}");
}

#[test]
fn w016_not_for_live_calls_constructors_or_native_attributes() {
    let (_, d) = run(
        "import { state } from 'weft'
         export function L({ xs, rate }) {
           const q = state('')
           return <ul title={stamp()}>{xs.map(x => <Row key={x.id} price={fmt(x.price * rate)} hit={match(q.value)} at={new Date()} />)}</ul>
         }",
    );
    assert!(d.is_empty(), "{d:?}");
}

// ---- W017: a row reads one entry of a whole object (v3 eval: add-one re-ran 150 rows) --------------------------

#[test]
fn w017_prop_indexed_by_the_row_item() {
    let (_, d) = run("export function L({ products, cart }) { return <ul>{products.map(p => <Row key={p.id} n={cart[p.id] ?? 0} />)}</ul> }");
    assert_eq!(codes(&d), ["W017"]);
    assert_eq!(d[0].severity, Severity::Warning);
    assert!(d[0].message.contains("`cart[p.id]` reads one entry of the whole `cart` in every row"), "{}", d[0].message);
    assert!(d[0].help.contains("`cart={cart}`") && d[0].help.contains("`cart.get(p.id)`"), "{}", d[0].help);
    assert!(d[0].fix.is_none(), "the parent has to pass the box");
}

#[test]
fn w017_box_value_indexed_by_the_row_item_autofixes_to_get() {
    let src = "import { state } from 'weft'
export function L({ products }) {
  const cart = state({})
  return <ul>{products.map(p => <li key={p.id}>{cart.value[p.id]} / {cart.value[p.id] * p.price}</li>)}</ul>
}";
    let (_, d) = run(src);
    assert_eq!(codes(&d), ["W017"], "one per object and list: {d:?}");
    let fix = d[0].fix.as_ref().unwrap();
    assert!(fix.safe);
    let fixed = apply_fix(src, &d[0]);
    assert!(fixed.contains("{cart.get(p.id)} / {cart.get(p.id) * p.price}"), "{fixed}");
    assert!(run(&fixed).1.is_empty());
}

#[test]
fn w017_not_for_handlers_constant_keys_or_setup() {
    let (_, d) = run(
        "export function L({ products, cart, labels, onAdd }) {
           return <ul>{products.map(p => <li key={p.id} title={labels['x']} onClick={() => onAdd(cart[p.id])}>{p.name}</li>)}</ul>
         }",
    );
    assert!(d.is_empty(), "{d:?}");
}

#[test]
fn w017_row_component_reads_an_entry_of_a_box_prop() {
    // v4 eval: a row read `live.value[stock.id]`, so every quote re-ran all 200 rows' formatters.
    let src = "import { derived, type State } from 'weft'
export function Row({ stock, live }: { stock: { id: string }; live: State<Record<string, { price: number }>> }) {
  const quote = derived(() => live.value[stock.id])
  return <li title={String(live.value[stock.id].price)}>{live.value[stock.id].price} {quote.value.price}</li>
}";
    let (_, d) = run(src);
    assert_eq!(codes(&d), ["W017"], "one per box and component: {d:?}");
    assert!(d[0].message.contains("`live.value[stock.id]` reads one entry of the whole `live.value`"), "{}", d[0].message);
    assert!(d[0].message.contains("every `Row`"), "{}", d[0].message);
    assert!(d[0].help.contains("`live.get(stock.id)`") && d[0].help.contains("`State<…>`"), "{}", d[0].help);
    let fix = d[0].fix.as_ref().unwrap();
    assert!(!fix.safe, "a prop is only probably a box");
    let fixed = apply_fix(src, &d[0]);
    assert!(fixed.contains("derived(() => live.get(stock.id))") && fixed.contains("{live.get(stock.id).price}"), "{fixed}");
    assert!(run(&fixed).1.is_empty());
}

#[test]
fn w017_local_box_indexed_by_a_prop_autofixes_safely() {
    let src = "import { state } from 'weft'
export function Badge({ id }: { id: string }) {
  const counts = state<Record<string, number>>({})
  return <b>{counts.value[id] ?? 0}</b>
}";
    let (_, d) = run(src);
    assert_eq!(codes(&d), ["W017"]);
    assert!(d[0].fix.as_ref().unwrap().safe);
    assert!(apply_fix(src, &d[0]).contains("{counts.get(id) ?? 0}"));
}

#[test]
fn w017_row_passes_an_entry_of_a_box_prop_to_a_child() {
    // v4 eval: `<StockRow live={live.value[s.id]} />`, the React/Solid shape, re-ran every row on every quote.
    let src = "import type { State } from 'weft'
export function List({ stocks, live }: { stocks: { id: string }[]; live: State<Record<string, number>> }) {
  return <ul>{stocks.map(s => <StockRow key={s.id} stock={s} live={live.value[s.id]} />)}</ul>
}";
    let (_, d) = run(src);
    assert_eq!(codes(&d), ["W017"]);
    assert!(d[0].message.contains("`live.value[s.id]` reads one entry of the whole `live.value` in every row"), "{}", d[0].message);
    assert!(d[0].help.contains("`live={live.get(s.id)}`") && d[0].help.contains("in `<StockRow>`"), "{}", d[0].help);
    assert!(!d[0].fix.as_ref().unwrap().safe);
    let fixed = apply_fix(src, &d[0]);
    assert!(fixed.contains("live={live.get(s.id)}"), "{fixed}");
    assert!(run(&fixed).1.is_empty());
    // A plain prop passed down names the child too.
    let (_, d) = run("export function L({ xs, cart }) { return <ul>{xs.map(x => <Row key={x.id} n={cart[x.id]} />)}</ul> }");
    assert_eq!(codes(&d), ["W017"]);
    assert!(d[0].help.contains("`cart={cart}`") && d[0].help.contains("in `<Row>`"), "{}", d[0].help);
}

#[test]
fn w017_not_for_box_keys_callbacks_handlers_setup_or_constant_keys() {
    // The v4 reference App: whole-record reads that run once per component, not once per row.
    let (_, d) = run(
        "import { derived, state, untrack, type State } from 'weft'
export function App({ stock, live, onPick }: { stock: { id: string }; live: State<Record<string, number>>; onPick: (n: number) => void }) {
  const tab = state('a')
  const views = state<Record<string, string>>({})
  const favorites = state<Record<string, boolean>>({})
  const view = derived(() => views.value[tab.value])
  const shown = derived(() => [stock].filter(s => favorites.value[s.id]).map(s => live.value[s.id]))
  const first = untrack(() => live.value[stock.id])
  const toggle = () => { favorites.value = { ...favorites.value, [stock.id]: !favorites.value[stock.id] } }
  return <p title={live.value['x'] + ''} onClick={() => onPick(live.value[stock.id] + first)}>{view.value}{shown.value.length}<button onClick={toggle} /></p>
}",
    );
    assert!(d.is_empty(), "{d:?}");
}

// ---- W018: an untracked snapshot only the JSX reads -------------------------------------------------------

#[test]
fn w018_untracked_snapshot_rendered_in_jsx() {
    // v4 eval: the W001 fix text offers `untrack()`; a row that took it rendered prices that never moved.
    let src = "import { untrack, type State } from 'weft'
export function Row({ stock, live }: { stock: { id: string }; live: State<Record<string, { price: number }>> }) {
  const quote = untrack(() => live.get(stock.id))
  return <li data-price={quote.price}>{quote.price}</li>
}";
    let (_, d) = run(src);
    assert_eq!(codes(&d), ["W018"]);
    assert_eq!(d[0].severity, Severity::Warning);
    assert!(d[0].message.contains("`quote` is an untracked snapshot"), "{}", d[0].message);
    assert!(d[0].help.contains("`derived(() => …)`") && d[0].help.contains("`quote.value`"), "{}", d[0].help);
    let fix = d[0].fix.as_ref().unwrap();
    assert!(!fix.safe);
    let fixed = apply_fix(src, &d[0]);
    assert!(fixed.contains("const quote = derived(() => live.get(stock.id))") && fixed.contains("{quote.value.price}"), "{fixed}");
    assert!(run(&fixed.replace("import { untrack,", "import { derived,")).1.is_empty());
}

#[test]
fn w018_not_for_snapshots_read_elsewhere_or_of_constants() {
    let (_, d) = run(
        "import { state, untrack } from 'weft'
export function Form({ initial }: { initial: string }) {
  const text = state('')
  const start = untrack(() => initial)
  const fixed = untrack(() => 42)
  return <p onClick={() => (text.value = start)}>{start} {fixed}</p>
}",
    );
    assert!(d.is_empty(), "{d:?}");
}

// ---- naming a prop in the body ------------------------------------------------------------------------------------

/// Compiles without a diagnostic; the output, with whitespace squeezed.
fn clean(source: &str) -> String {
    let (code, d) = run(source);
    assert_eq!(codes(&d), Vec::<&str>::new(), "{source}");
    code.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[test]
fn alias_reads_the_prop_at_each_use() {
    let code = clean("export function A(props) { const amount = props.amount; return <p>{amount}</p> }");
    assert!(code.contains("props.amount"), "{code}");
    assert!(!code.contains("amount = props"), "no copy is left: {code}");
    assert!(code.contains("() =>"), "a live hole: {code}");
}

#[test]
fn alias_paths_chains_and_casts() {
    let code = clean("export function A(props: any) { const u = props.user as any; const name = u.name!; const n = props.items.length; return <p>{name}{n}</p> }");
    assert!(code.contains("props.user.name") && code.contains("props.items.length"), "{code}");
}

#[test]
fn alias_of_a_destructured_param() {
    let code = clean("export function A({ items, size = 2 }) { const n = items.length; const s = size; return <p>{n}{s}</p> }");
    assert!(code.contains("props.items.length"), "{code}");
    assert!(code.contains("props.size === undefined ? 2 : props.size"), "{code}");
}

#[test]
fn alias_destructuring_renames_defaults_and_rest() {
    let code = clean("export function A(props) { const { amount: a, label = 'x', ...rest } = props; return <p {...rest} title={rest.t}>{a}{label}</p> }");
    assert!(code.contains("props.amount") && code.contains("props.label === undefined ? \"x\" : props.label"), "{code}");
    assert!(code.contains("_$restOf(props, [\"amount\", \"label\"])") && code.contains("props.t"), "{code}");
}

#[test]
fn alias_default_seen_by_a_closure_above_it() {
    let code = clean("export function A(props) { function f() { return b } const { b = 1 } = props; return <button onClick={f} /> }");
    assert!(code.contains("props.b === undefined ? 1 : props.b"), "{code}");
}

#[test]
fn alias_shadowing_is_by_binding_not_name() {
    let code = clean("export function A(props) { const a = props.a; const f = (a) => a + 1; return <p onClick={() => f(a)}>{a}</p> }");
    assert!(code.contains("(a) => a + 1") && code.contains("f(props.a)"), "{code}");
}

#[test]
fn alias_refused_when_a_closure_shadows_the_props_name() {
    let (_, d) = run("export function A(props) { const a = props.a; const f = (props) => a + props; return <p onClick={f} /> }");
    assert_eq!(codes(&d), ["W001"], "`props` at the use would be the wrong one");
}

#[test]
fn alias_keeps_shorthand_and_other_declarators() {
    let code = clean("export function A(props) { const a = props.a, b = 1; const o = () => ({ a, b }); return <p onClick={o} /> }");
    assert!(code.contains("a: props.a") && code.contains("b = 1"), "{code}");
}

#[test]
fn alias_let_never_written_is_fine() {
    let code = clean("export function A(props) { let a = props.a; return <p>{a}</p> }");
    assert!(code.contains("props.a"), "{code}");
}

#[test]
fn alias_written_is_a_local_override() {
    let code = clean("export function A(props) { let a = props.a; const f = () => { a = 2; a += 1; a++ }; return <p onClick={f}>{a}</p> }");
    assert!(code.contains("props = _$localProps(props, [\"a\", 0])"), "{code}");
    assert!(code.contains("props.a = 2") && code.contains("props.a += 1") && code.contains("props.a++"), "{code}");
    let code = clean("export function A(props) { let { a = 1 } = props; return <p onClick={() => a++}>{a}</p> }");
    assert!(code.contains("_$localProps(props, [\"a\", () => 1])") && !code.contains("undefined"), "{code}");
    let code = clean("export function A({ a }) { return <p onClick={() => { a = 2 }}>{a}</p> }");
    assert!(code.contains("_$localProps"), "a written parameter too: {code}");
}

#[test]
fn alias_const_stays_read_only() {
    for src in [
        "export function A(props) { const a = props.a; return <p onClick={() => { a = 2 }}>{a}</p> }",
        "export function A(props) { const { a } = props; return <p onClick={() => { a++ }}>{a}</p> }",
    ] {
        let (_, d) = run(src);
        assert_eq!(codes(&d), ["W001"], "{src}");
        assert!(d[0].help.contains("`let`") && d[0].help.contains("props"), "{}", d[0].help);
    }
}

#[test]
fn props_write_is_the_same_override() {
    let code = clean("export function A(props) { return <p onClick={() => { props.a = 2; props.b++ }}>{props.a}</p> }");
    assert!(code.contains("_$localProps(props, [ \"a\", 0, \"b\", 0 ])"), "{code}");
    let code = clean("export function A(props) { const f = () => { props.user.name = 1 }; return <p onClick={f} /> }");
    assert!(!code.contains("_$localProps"), "a deeper write is the object's: {code}");
}

#[test]
fn alias_written_with_no_single_prop_is_w001() {
    for src in [
        "export function A(props) { let n = props.user.name; return <p onClick={() => { n = 2 }}>{n}</p> }",
        "export function A(props) { let c = props.children; c = 1; return <p>{c}</p> }",
        "export function A(props) { let a = props.a; const f = (o) => { ({ a } = o) }; return <p onClick={f}>{a}</p> }",
    ] {
        let (_, d) = run(src);
        assert_eq!(codes(&d), ["W001"], "{src}");
        assert!(d[0].help.contains("state.linked"));
    }
}

#[test]
fn bind_gives_the_prop_a_setter_and_a_plain_read_has_none() {
    let code = clean("import { bind, state } from 'weft'; export function A() { const n = state(1); return <C n={bind(n)} m={n.value} /> }");
    assert!(code.contains("get n() { return n.value; }, set n(_v) { n.value = _v; }"), "{code}");
    assert!(!code.contains("set m"), "{code}");
}

#[test]
fn bind_outside_a_component_prop_is_w061() {
    for src in [
        "import { bind, state } from 'weft'; export function A() { const n = state(1); return <input value={bind(n)} /> }",
        "import { bind, state } from 'weft'; export function A() { const n = state(1); const v = bind(n); return <p /> }",
        "import { bind } from 'weft'; export function A() { return <C n={bind(1)} /> }",
    ] {
        let (_, d) = run(src);
        assert!(codes(&d).contains(&"W061"), "{src}");
    }
}

#[test]
fn alias_not_for_arrays_computed_keys_or_calls() {
    for src in [
        "export function A(props) { const [a] = props.pair; return <p>{a}</p> }",
        "export function A(props) { const { [props.k]: a } = props; return <p>{a}</p> }",
        "export function A(props) { const a = props.f(); return <p>{a}</p> }",
        "export function A(props) { const a = props.a ?? 1; return <p>{a}</p> }",
    ] {
        let (_, d) = run(src);
        assert_eq!(codes(&d), ["W001"], "{src}");
    }
}

#[test]
fn alias_passed_to_a_helper_in_the_body_is_still_one_read() {
    let (_, d) = run("export function A(props) { const a = props.a; const c = makeChart(a); return <p>{c}</p> }");
    assert_eq!(codes(&d), ["W001"]);
    let (_, d) = run("import { state } from 'weft'; export function A(props) { const a = props.a; const s = state(a); return <p>{s.value}</p> }");
    assert_eq!(codes(&d), ["W005"]);
}

#[test]
fn alias_children_is_the_memo() {
    let code = clean("export function A(props) { const kids = props.children; return <div>{kids}</div> }");
    assert!(code.contains("_children()"), "{code}");
}

#[test]
fn alias_a_list_over_it_is_keyed() {
    let code = clean("export function A(props) { const items = props.items; return <ul>{items.map(x => <li key={x.id}>{x.id}</li>)}</ul> }");
    assert!(code.contains("For") && code.contains("props.items"), "{code}");
}

#[test]
fn alias_only_in_components() {
    let code = clean("export function helper(props) { const a = props.a; return a }");
    assert!(code.contains("const a = props.a"), "{code}");
}

#[test]
fn a_rows_key_is_read_once_as_the_row_is_made() {
    let code = clean("export function A(p) { return <ul>{p.xs.map(x => <li key={x.id} class={p.on.get(x.id) ? 'a' : ''} onClick={() => go(x.id)}>{x.t}</li>)}</ul> }");
    assert!(code.contains("const _key$ = x().id;") && code.contains("p.on.get(_key$)") && code.contains("go(_key$)"), "{code}");
    assert!(code.contains("x().t"), "the rest of the row stays live: {code}");
    let code = clean("export function A(p) { return <ul>{p.xs.map(x => <li key={x.id} onClick={() => [].map(x => x().id)} />)}</ul> }");
    assert!(!code.contains("_key$"), "rebound inside: {code}");
}

// ---- W001 / W005 ---------------------------------------------------------------------------------------------

#[test]
fn w001_prop_read_in_setup() {
    let src = "export function A({ items }) { const n = items.length + 1; return <p>{n}</p> }";
    let (_, d) = run(src);
    assert_eq!(codes(&d), ["W001"]);
    assert_eq!(apply_fix(src, &d[0]), "export function A({ items }) { const n = derived(() => items.length + 1); return <p>{n}</p> }");
    assert!(!d[0].fix.as_ref().unwrap().safe, "the fix needs `.value` at the use site");
}

#[test]
fn w001_box_value_read_in_setup() {
    let (_, d) = run("import { state } from 'weft'; export function A() { const c = state(0); const twice = c.value * 2; return <p>{twice}</p> }");
    assert_eq!(codes(&d), ["W001"]);
}

#[test]
fn w001_helper_call_with_a_prop() {
    let (_, d) = run("export function A({ items }) { makeChart(items); return <p /> }");
    assert_eq!(codes(&d), ["W001"]);
}

#[test]
fn reads_in_jsx_handlers_derived_and_watch_are_fine() {
    let (_, d) = run(
        "import { state, derived, watch } from 'weft'
         export function A({ items, onPick }) {
           const q = state('')
           const shown = derived(() => items.filter(i => i.name.includes(q.value)))
           watch(() => q.value, v => console.log(v, items.length))
           const pick = (id) => onPick(id, q.value)
           q.value = 'x'
           return <p onClick={() => pick(1)}>{shown.value.length} {q.value}</p>
         }",
    );
    assert!(d.is_empty(), "{d:?}");
}

#[test]
fn w005_state_of_prop() {
    let src = "export function A({ initial }) { const v = state(initial); return <p>{v.value}</p> }";
    let (_, d) = run(src);
    assert_eq!(codes(&d), ["W005"]);
    assert!(apply_fix(src, &d[0]).contains("state.linked(() => initial)"));
}

// ---- §3.4 lists ------------------------------------------------------------------------------------------------

#[test]
fn map_becomes_keyed_list_with_live_item() {
    let (code, d) = run("export function L({ xs }) { return <ul>{xs.map(x => <li key={x.id}>{x.name}</li>)}</ul> }");
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("_$component(For, "), "{code}");
    assert!(code.contains("by: (x) => x.id"), "key stays raw in `by`: {code}");
    assert!(code.contains("x().name"), "row reads the live item: {code}");
    assert!(!code.contains("key"), "key attribute removed: {code}");
}

#[test]
fn optional_map_is_a_keyed_list() {
    let (code, d) = run("export function L({ xs }) { return <ul>{xs?.map(x => <li key={x.id}>{x.name}</li>)}</ul> }");
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("_$component(For, "), "{code}");
    assert!(code.contains("by: (x) => x.id"), "{code}");
    assert!(code.contains("x().name"), "{code}");
    assert!(!code.contains(".map"), "no plain `.map` over accessor reads: {code}");

    let src = "import { state } from 'weft'\nexport function L() { const posts = state(null); return <ul>{posts.value?.map(p => <li key={p.id}>{p.title}</li>)}</ul> }";
    let (code, d) = run(src);
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("return posts.value;"), "`each` reads the box live: {code}");
    assert!(code.contains("p().title"), "{code}");

    let (code, _) = run("export function L({ xs }) { return <ul>{xs?.map(t => <li>{t}</li>)}</ul> }");
    assert!(code.contains("_$component(For, "), "unkeyed rows too: {code}");
    let (code, _) = run("export function L({ xs }) { return <ul>{xs.map?.(x => <li key={x.id}>{x.n}</li>)}</ul> }");
    assert!(code.contains("_$component(For, ") && code.contains("x().n"), "{code}");
}

#[test]
fn optional_links_before_map_stay_in_the_list_source() {
    let src = "export function L({ q }) { return <ul>{q?.data.filter(x => x.on).map(x => <li key={x.id}>{x.n}</li>)}</ul> }";
    let (code, _) = run(src);
    assert!(code.contains("_$component(For, "), "{code}");
    assert!(code.contains("q?.data.filter((x) => x.on)"), "{code}");
    assert!(code.contains("x().n"), "{code}");
    let (code, _) = run("export function L({ q }) { return <ul>{q?.data?.map(x => <li key={x.id}>{x.n}</li>)}</ul> }");
    assert!(code.contains("q?.data"), "{code}");
    assert!(code.contains("x().n"), "{code}");
}

#[test]
fn a_rows_key_is_written_once() {
    // The key can't change while the row lives (a new item under the same key has the same key), so a hole or
    // attribute that is exactly the key gets no effect. Anything else about the item stays live.
    let src = "export function L({ xs }) { return <ul>{xs.map(x => <li key={x.id} data-id={x.id} title={x.name}>{x.id}: {x.name}</li>)}</ul> }";
    let (code, d) = run(src);
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("\"data-id\", _key$);") && !code.contains("() => (_key$)"), "{code}");
    assert!(code.contains("() => (x().name)") && code.contains("_$bind("), "{code}");
    // Hydrating, the attribute stays a binding (it skips the server's value; a write would be a mutation).
    let o = Options { filename: "App.tsx".into(), hydratable: true, ..Default::default() };
    let hydratable = compile(src, &o).code.unwrap();
    assert!(hydratable.contains("_$bind(() => [_key$, x().name]"), "{hydratable}");
    // Other key shapes, and expressions that only contain the key, stay live.
    let (code, _) = run("export function L({ xs }) { return <ul>{xs.map(x => <li key={x.id}>{x.id + 1}</li>)}</ul> }");
    assert!(code.contains("() => (_key$ + 1)"), "{code}");
}

#[test]
fn list_index_is_live() {
    let (code, _) = run("export function L({ xs }) { return <ol>{xs.map((x, i) => <li key={x}>{i + 1}. {x}</li>)}</ol> }");
    assert!(code.contains("i() + 1"), "{code}");
}

#[test]
fn filter_sort_chain_is_the_list_source() {
    let (code, _) = run(
        "export function L({ xs }) { return <ul>{xs.filter(x => x.on).sort((a, b) => a.n - b.n).map(x => <li key={x.id}>{x.n}</li>)}</ul> }",
    );
    assert!(code.contains("get each()"), "{code}");
    assert!(code.contains("props.xs.filter("), "{code}");
}

#[test]
fn destructured_row_item() {
    let (code, d) = run("export function L({ xs }) { return <ul>{xs.map(({ id, name }) => <li key={id}>{name}</li>)}</ul> }");
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("by: ({ id, name }) => id"), "{code}");
    assert!(code.contains("_item().name"), "{code}");
}

#[test]
fn destructured_row_rest_and_nested() {
    let (code, d) = run("export function L({ xs }) { return <ul>{xs.map(([id, { name: [first] }, ...more]) => <li key={id}>{first}{more.length}</li>)}</ul> }");
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("_item()[1].name[0]"), "{code}");
    assert!(code.contains("_item().slice(2).length"), "{code}");
}

#[test]
fn destructured_row_it_cant_bind_is_w019() {
    for row in ["({ id, ...more })", "({ id, n = 1 })", "([id, n = 1])", "({ id, [k]: n })"] {
        let (_, d) = run(&format!("const k = 'a'; export function L({{ xs }}) {{ return <ul>{{xs.map({row} => <li key={{id}}>{{id}}</li>)}}</ul> }}"));
        assert!(d.iter().any(|x| x.code == "W019"), "{row}: {d:?}");
    }
}

#[test]
fn destructured_row_tuple() {
    let (code, d) = run("export function L({ xs }) { return <ul>{Object.entries(xs).map(([id, name]) => <li key={id}>{name}</li>)}</ul> }");
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("by: ([id, name]) => id"), "{code}");
    assert!(code.contains("_item()[1]"), "{code}");
}

#[test]
fn primitive_lists_need_no_key() {
    let (code, d) = run("export function L({ tags }) { return <ul>{tags.map(t => <li>{t}</li>)}</ul> }");
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("_$component(For, ") && !code.contains("by:"), "{code}");
}

#[test]
fn list_inside_conditional() {
    let (code, _) = run("export function L({ xs, on }) { return <div>{on ? xs.map(x => <p key={x.id}>{x.n}</p>) : null}</div> }");
    assert!(code.contains("_$component(For, "), "{code}");
}

#[test]
fn conditional_row_roots_are_keyed() {
    let (code, d) = run("export function L({ xs }) { return <ul>{xs.map(x => (x.on ? <li key={x.id}>{x.n}</li> : <b key={x.id}>off</b>))}</ul> }");
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("by: (x) => x.id"), "{code}");
    assert!(!code.contains("key"), "every branch's key is removed: {code}");
}

#[test]
fn fragment_row_roots_are_keyed() {
    let (code, d) = run("export function L({ xs }) { return <dl>{xs.map(x => <><dt key={x.id}>{x.k}</dt><dd>{x.v}</dd></>)}</dl> }");
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("by: (x) => x.id"), "{code}");
    let (code, d) = run("export function L({ xs }) { return <ul>{xs.map(x => x.on && <li key={x.id}>{x.n}</li>)}</ul> }");
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("by: (x) => x.id"), "{code}");
}

#[test]
fn w010_rows_keyed_differently() {
    let (_, d) = run("export function L({ xs }) { return <ul>{xs.map(x => (x.on ? <li key={x.id}>a</li> : <li key={x.name}>b</li>))}</ul> }");
    assert_eq!(codes(&d), ["W010"]);
    assert!(d[0].message.contains("keyed differently"), "{}", d[0].message);
}

#[test]
fn w010_fragment_row_without_key() {
    let (_, d) = run("export function L({ xs }) { return <dl>{xs.map(x => <><dt>{x.k}</dt><dd>{x.v}</dd></>)}</dl> }");
    assert_eq!(codes(&d), ["W010"]);
}

#[test]
fn w010_missing_key_with_safe_fix() {
    let src = "export function L({ xs }) { return <ul>{xs.map(x => <li>{x.name} {x.id}</li>)}</ul> }";
    let (_, d) = run(src);
    assert_eq!(codes(&d), ["W010"]);
    let fixed = apply_fix(src, &d[0]);
    assert!(fixed.contains("<li key={x.id}>"), "{fixed}");
    assert!(run(&fixed).1.is_empty());
}

#[test]
fn w010_without_an_id_field_has_no_edit() {
    let (_, d) = run("export function L({ xs }) { return <ul>{xs.map(x => <li>{x.name}</li>)}</ul> }");
    assert_eq!(codes(&d), ["W010"]);
    assert!(d[0].fix.is_none());
}

#[test]
fn w013_early_return_in_row() {
    let (_, d) = run("export function L({ xs }) { return <ul>{xs.map(x => { if (!x.on) return null; return <li key={x.id} /> })}</ul> }");
    assert!(codes(&d).contains(&"W013"), "{d:?}");
}

// ---- W014: identity-breaking spreads into keyed lists (v3 finding) ---------------------------------------------

#[test]
fn w014_error_when_the_spread_list_is_rendered_by_key_here() {
    let (_, d) = run(
        "import { derived } from 'weft'
         export function L({ products, prices }) {
           const merged = derived(() => products.map(p => ({ ...p, price: prices[p.id] ?? p.price })))
           return <ul>{merged.value.map(p => <li key={p.id}>{p.price}</li>)}</ul>
         }",
    );
    assert_eq!(codes(&d), ["W014"]);
    assert_eq!(d[0].severity, Severity::Error);
    assert!(d[0].message.contains("`merged` is rendered as a keyed list (line 4)"), "{}", d[0].message);
}

#[test]
fn w014_warning_when_the_spread_list_leaves_the_file() {
    let (_, d) = run(
        "import { derived } from 'weft'
         export function App({ products, prices }) {
           const merged = derived(() => products.map(p => ({ ...p, price: prices[p.id] })))
           return <List items={merged.value} />
         }",
    );
    assert_eq!(codes(&d), ["W014"]);
    assert_eq!(d[0].severity, Severity::Warning);
}

#[test]
fn w014_not_for_replacing_one_item() {
    let (_, d) = run(
        "import { state } from 'weft'
         export function App() {
           const products = state([])
           const push = (id, price) => { products.value = products.value.map(p => (p.id === id ? { ...p, price } : p)) }
           return <ul>{products.value.map(p => <li key={p.id} onClick={() => push(p.id, 1)}>{p.price}</li>)}</ul>
         }",
    );
    assert!(d.is_empty(), "{d:?}");
}

#[test]
fn w014_project_view_upgrades_a_warning_that_reaches_a_keyed_list() {
    let app = compile(
        "import { derived } from 'weft'
         import { List as ProductList } from './List'
         export function App({ products, prices }) {
           const merged = derived(() => products.map(p => ({ ...p, price: prices[p.id] })))
           return <ProductList items={merged.value} />
         }",
        &Options { filename: "src/App.tsx".into(), check_only: true, ..Default::default() },
    );
    let list = compile(
        "export function List({ items }) { return <ul>{items.map(p => <li key={p.id}>{p.price}</li>)}</ul> }",
        &Options { filename: "src/List.tsx".into(), check_only: true, ..Default::default() },
    );
    assert_eq!(app.facts.spread_props.len(), 1, "{:?}", app.facts);
    assert_eq!(app.facts.spread_props[0].component, "List", "the imported name, not the local alias");
    assert_eq!(list.facts.keyed_props[0].prop, "items");
    let (mut app_d, mut list_d) = (app.diagnostics.clone(), list.diagnostics.clone());
    assert_eq!(app_d[0].severity, Severity::Warning, "per file it stays a warning");
    let mut files = [
        FileView { path: "src/App.tsx", facts: &app.facts, diagnostics: &mut app_d },
        FileView { path: "src/List.tsx", facts: &list.facts, diagnostics: &mut list_d },
    ];
    link_w014(&mut files, |_, spec| (spec == "./List").then(|| "src/List.tsx".to_string()));
    assert_eq!(app_d[0].severity, Severity::Error);
    assert!(app_d[0].message.contains("`<List items>` renders it as a keyed list (src/List.tsx:1)"), "{}", app_d[0].message);
}

#[test]
fn w014_project_view_leaves_unkeyed_targets_alone() {
    let src = "import { derived } from 'weft'
         export function Grid(props) { return <p>{props.rows.length}</p> }
         export function Keyed(props) { return <ul>{props.rows.map(r => <li key={r.id} />)}</ul> }
         export function App({ products, prices }) {
           const merged = derived(() => products.map(p => ({ ...p, price: prices[p.id] })))
           return <Grid rows={merged.value} />
         }";
    let out = compile(src, &Options { check_only: true, ..Default::default() });
    assert_eq!(out.facts.keyed_props.len(), 1, "{:?}", out.facts);
    assert_eq!(out.facts.keyed_props[0].component, "Keyed", "the `props.rows` form counts");
    let mut d = out.diagnostics.clone();
    link_w014(&mut [FileView { path: "App.tsx", facts: &out.facts, diagnostics: &mut d }], |_, _| None);
    assert_eq!(d[0].severity, Severity::Warning, "`Grid` doesn't key `rows`");

    let out = compile(&src.replace("<Grid rows", "<Keyed rows"), &Options { check_only: true, ..Default::default() });
    let mut d = out.diagnostics.clone();
    link_w014(&mut [FileView { path: "App.tsx", facts: &out.facts, diagnostics: &mut d }], |_, _| None);
    assert_eq!(d[0].severity, Severity::Error, "a same-file component needs no resolver");
}

// ---- W015: a box where JSX needs its value (§11 `.value` question) -------------------------------------------

#[test]
fn w015_bare_box_in_jsx_child_and_native_attribute() {
    let src = "import { state } from 'weft'; export function A() { const n = state(0); return <input value={n} title={n.value}>{n}</input> }";
    let (_, d) = run(src);
    assert_eq!(codes(&d), ["W015", "W015"]);
    let mut fixed = src.to_string();
    for diag in d.iter().rev() {
        fixed = apply_fix(&fixed, diag);
    }
    assert!(fixed.contains("value={n.value}") && fixed.contains(">{n.value}<"), "{fixed}");
    assert!(run(&fixed).1.is_empty());
}

#[test]
fn passing_a_box_to_a_component_is_allowed() {
    let (_, d) = run("import { state } from 'weft'; export function A() { const c = state(''); return <CouponInput value={c} /> }");
    assert!(d.is_empty(), "{d:?}");
}

// ---- plumbing ----------------------------------------------------------------------------------------------------

#[test]
fn syntax_errors_are_diagnostics() {
    let out = compile("export function A( { return <p> }", &Options::default());
    assert!(out.code.is_none());
    assert_eq!(out.diagnostics[0].code, "W000");
}

#[test]
fn check_only_skips_codegen() {
    let out = compile(
        "export function A({ items }) { const n = items.length + 1; return <p>{n}</p> }",
        &Options { check_only: true, ..Default::default() },
    );
    assert!(out.code.is_none());
    assert_eq!(codes(&out.diagnostics), ["W001"]);
}

#[test]
fn diagnostics_have_editor_positions() {
    let (_, d) = run("export function A({ items }) {\n  const n = items.length + 1\n  return <p>{n}</p>\n}");
    assert_eq!((d[0].line, d[0].column), (2, 13));
}

#[test]
fn source_maps_point_at_authored_lines() {
    let src = "export function A({ a }) {\n  return <p>{a}</p>\n}\n";
    let out = compile(src, &Options { source_map: true, ..Default::default() });
    let map = out.map.expect("map");
    assert!(map.contains("\"mappings\""), "{map}");
}

// ---- research 19 step 4: dev comments, explain ---------------------------------------------------------------

const TWO_LINES: &str = "export function A(props: { n: number }) {\n  return (\n    <ul>\n      <li title=\"x\">{props.n}</li>\n    </ul>\n  )\n}";

#[test]
fn explain_maps_each_jsx_node_to_its_authored_line() {
    let out = compile(TWO_LINES, &Options { filename: "App.tsx".into(), explain: true, ..Default::default() });
    let explain = out.explain.expect("explain");
    let ul = explain.iter().find(|x| x.line == 3).expect("an entry on line 3");
    assert_eq!((ul.column, ul.node.as_str()), (5, "<ul>"));
    assert!(ul.code.contains("_$tpl(\"<ul><li title=\\\"x\\\"></li></ul>\")") && ul.code.contains("_$child("), "{}", ul.code);
}

#[test]
fn static_aria_booleans_are_written_as_words() {
    // `aria-pressed={false}` means "not pressed", not "not a toggle": ARIA states are the strings true/false.
    let (code, _) = run("export const A = () => <button aria-pressed={false} aria-hidden={true} disabled={false} hidden={true}>x</button>");
    assert!(code.contains(r#"<button aria-pressed=\"false\" aria-hidden=\"true\" hidden>"#), "{code}");
}

#[test]
fn dev_templates_name_their_source_line() {
    let out = compile(TWO_LINES, &Options { filename: "App.tsx".into(), dev: true, ..Default::default() });
    let code = out.code.unwrap();
    assert!(code.contains("// App.tsx:3 <ul>\n"), "{code}");
    // Only hydratable output passes the place on, to `htpl`'s mismatch warnings.
    assert!(code.contains("_$tpl(\"<ul><li title=\\\"x\\\"></li></ul>\")"), "{code}");
    let hydratable = compile(TWO_LINES, &Options { filename: "App.tsx".into(), dev: true, hydratable: true, ..Default::default() });
    assert!(hydratable.code.unwrap().contains(", false, \"App.tsx:3 <ul>\")"));
    let prod = compile(TWO_LINES, &Options { filename: "App.tsx".into(), ..Default::default() }).code.unwrap();
    assert!(!prod.contains("App.tsx:3"), "{prod}");
}

#[test]
fn weft_back_end_source_maps_point_at_the_authored_lines() {
    let source = "import { state } from 'weft'\n\nconst helper = () => 1\n\nexport function A() {\n  const count = state(helper())\n  return (\n    <section>\n      <button onClick={() => count.value++}>\n        {count.value * 2}\n      </button>\n    </section>\n  )\n}\n";
    let out = compile(source, &Options { filename: "App.tsx".into(), source_map: true, ..Default::default() });
    let code = out.code.unwrap();
    assert!(!code.contains(['\u{E000}', '\u{E001}', '\u{E002}', '\u{E003}']), "{code}");
    let json = out.map.expect("a map");
    let map = oxc_sourcemap::SourceMap::from_json_string(&json).unwrap();
    let table = map.generate_lookup_table();
    // (text in the output, its authored line, 1-based)
    for (needle, line) in [("helper = ", 3), ("state(helper())", 6), ("count.value++", 9), ("count.value * 2", 10)] {
        let at = code.find(needle).unwrap_or_else(|| panic!("{needle} in {code}"));
        let out_line = code[..at].matches('\n').count() as u32;
        let out_col = code[..at].rsplit('\n').next().unwrap().encode_utf16().count() as u32;
        let t = map.lookup_token(&table, out_line, out_col).unwrap_or_else(|| panic!("no token for {needle}"));
        assert_eq!(t.get_src_line() + 1, line, "{needle}\n{code}");
    }
}

#[test]
fn only_hydratable_output_imports_the_claiming_helpers() {
    let imports = |hydratable| {
        let code = compile(TWO_LINES, &Options { filename: "App.tsx".into(), hydratable, ..Default::default() }).code.unwrap();
        code.lines().next().unwrap().to_string()
    };
    let client = imports(false);
    assert!(client.contains("tpl as _$tpl") && client.contains("child as _$child"), "{client}");
    assert!(!client.contains("htpl") && !client.contains("hchild") && !client.contains("first"), "{client}");
    let hydratable = imports(true);
    assert!(hydratable.contains("htpl as _$htpl") && hydratable.contains("hchild as _$hchild"), "{hydratable}");
    assert!(!hydratable.contains("tpl as _$tpl,") && !hydratable.contains(" child as _$child"), "{hydratable}");
}

#[test]
fn content_properties_render_on_the_server_and_refuse_children() {
    let ssr = |src: &str| compile(src, &Options { filename: "App.tsx".into(), generate: "ssr".into(), ..Default::default() });
    let code = ssr("export const A = (p: any) => <p textContent={p.s} />").code.unwrap();
    assert!(code.contains("\">\" + _$escape(String((p.s) ?? \"\")) + \"</p>\""), "{code}");
    let code = ssr("export const A = (p: any) => <div innerHTML={p.h} />").code.unwrap();
    assert!(code.contains("\">\" + String((p.h) ?? \"\") + \"</div>\""), "{code}");
    let out = compile("export const A = (p: any) => <p textContent={p.s}>x</p>", &Options { filename: "App.tsx".into(), ..Default::default() });
    assert!(out.code.is_none() && out.diagnostics[0].message.contains("can't also have children"), "{:?}", out.diagnostics);
}

// ---- HMR (research 21) -----------------------------------------------------------------------------------------

fn hot(source: &str) -> String {
    let o = Options { filename: "/app/Card.tsx".into(), dev: true, hmr: true, ..Default::default() };
    compile(source, &o).code.unwrap_or_default()
}

#[test]
fn hmr_registers_components_and_keeps_body_state() {
    let code = hot("import { state } from 'weft'\nexport function Card() { const open = state(false); return <p>{open.value}</p> }\nconst Row = () => <li />");
    assert!(code.contains(r#"_$keep(state(false), "Card", "open:"#), "{code}");
    assert!(code.contains(r#"import { hot as _$hot, keep as _$keep } from "weft/hmr";"#), "{code}");
    assert!(code.contains(r#"_$hot("/app/Card.tsx", { Card: [Card, ""#) && code.contains("Row: [Row, "), "{code}");
    assert!(code.contains("import.meta.hot.accept();"), "{code}");
}

#[test]
fn hmr_key_follows_the_initializer() {
    let key = |src: &str| {
        let code = hot(src);
        let at = code.find("\"n:").expect("key");
        code[at..at + 20].to_string()
    };
    let a = key("export function C() { const n = state(0); return <i>{n.value}</i> }");
    let b = key("export function C() { const n = state(0); return <b>{n.value}!</b> }");
    let c = key("export function C() { const n = state(1); return <i>{n.value}</i> }");
    assert_eq!(a, b, "a markup edit keeps the key");
    assert_ne!(a, c, "a new initializer resets");
}

#[test]
fn hmr_accepts_only_component_modules() {
    assert!(!hot("export const total = 1\nexport function C() { return <i /> }").contains("accept()"));
    assert!(!hot("import { render } from 'weft/dom'\nfunction App() { return <i /> }\nrender(() => <App />, document.body)").contains("accept()"));
    assert!(hot("function App() { return <i /> }\nexport default App\nexport type P = { a: 1 }").contains("accept()"));
}

#[test]
fn hmr_is_dev_dom_only() {
    let src = "export function C() { const n = state(0); return <i>{n.value}</i> }";
    for o in [
        Options { dev: false, hmr: true, ..Default::default() },
        Options { dev: true, hmr: false, ..Default::default() },
        Options { dev: true, hmr: true, generate: "ssr".into(), ..Default::default() },
        Options { dev: true, hmr: true, hydratable: true, ..Default::default() },
    ] {
        let code = compile(src, &o).code.unwrap();
        assert!(!code.contains("weft/hmr") && !code.contains("_$keep"), "{code}");
    }
    assert!(!hot("const x = 1").contains("weft/hmr"), "no components, no registration");
}

// ---- warp findings (research 24 §6) ----------------------------------------------------------------------------

#[test]
fn an_import_after_jsx_compiles() {
    for o in [Options::default(), Options { hydratable: true, ..Default::default() }, Options { generate: "ssr".into(), ..Default::default() }] {
        let out = compile("// a — b\nexport const A = () => <p>— x</p>\nimport { state } from 'weft'\nexport const B = () => <i>{state(1).value}</i>", &o);
        let code = out.code.expect("compiles");
        assert!(code.contains(r#"import { state } from "weft""#), "{code}");
        assert_eq!(code.matches("_$tpl(").count() + code.matches("_$htpl(").count(), if o.generate == "ssr" { 0 } else { 2 }, "{code}");
    }
}

#[test]
fn w001_not_on_a_rest_alias() {
    // a rest parameter is a live view of the props: holding it is not a read
    let (_, d) = run("export function A({ a, ...rest }: any) { const x = rest; return <p {...x}>{a}</p> }");
    assert!(d.is_empty(), "{d:?}");
    let (_, d) = run("export function A({ a, ...rest }: any) { const x = rest.title + '!'; return <p title={x}>{a}</p> }");
    assert_eq!(codes(&d), ["W001"], "a member of rest is a prop read");
    let (code, d) = run("export function A({ a, ...rest }: any) { const x = rest.title; const y = rest.a; return <p title={x}>{a}{y}</p> }");
    assert_eq!(codes(&d), ["W001"], "`a` isn't in rest: {code}");
    let (code, d) = run("export function A({ a, ...rest }: any) { const x = rest.title; return <p title={x}>{a}</p> }");
    assert!(d.is_empty() && code.contains("props.title"), "{code}");
}

#[test]
fn a_rest_parameter_is_one_view_however_often_it_is_used() {
    let (code, _) = run("export function A({ a, ...rest }: any) { const f = () => rest.x; watch(() => rest, () => {}); return <B {...rest} y={rest.y}>{a}</B> }");
    assert_eq!(code.matches("_$omit(").count(), 1, "{code}");
}

#[test]
fn ref_to_a_const_or_an_import_calls_it() {
    let src = "import { register } from './reg'\nconst local = (el: Element) => el\nexport function A() { let mine; return <div><p ref={register}>x</p><i ref={local}>y</i><b ref={mine}>z</b></div> }";
    let (code, _) = run(src);
    assert!(!code.contains("register = ") && !code.contains("local = _"), "no assignment to a const or an import: {code}");
    assert!(code.contains("mine = _e"), "a `let` is still assigned: {code}");
}

#[test]
fn ref_to_a_variable_beside_a_spread_assigns_it() {
    let (code, _) = run("export function A(props: any) { let el: any; return <p ref={el} {...props}>x</p> }");
    assert!(code.contains("el = _"), "{code}");
    let (code, _) = run("import { register } from './reg'\nexport function A(props: any) { return <p ref={register} {...props}>x</p> }");
    assert!(!code.contains("register = "), "{code}");
}

#[test]
fn a_key_on_the_index_parameter_keys_by_position() {
    let (code, _) = run("export function L({ xs }: any) { return <ul>{xs.map((x: any, i: number) => <li key={i}>{x.name}</li>)}</ul> }");
    assert!(code.contains("by: (x, i) => i"), "{code}");
}

// ---- shape variants (research 31 §5) ---------------------------------------------------------------------------

fn shaped(source: &str) -> String {
    let opts = Options { filename: "/app/App.tsx".into(), shapes: Some(Default::default()), ..Default::default() };
    compile(source, &opts).code.expect("compiled")
}

#[test]
fn no_variants_unless_asked() {
    let (code, _) = run("export function A() { return <p>{1}</p> }");
    assert!(!code.contains("$shape") && !code.contains("weft/shape"), "{code}");
}

#[test]
fn a_variant_keeps_markup_and_drops_behaviour() {
    let code = shaped(
        "import { q } from './q'; import { state } from 'weft';
         export function Feed() {
           const posts = q({ limit: 5 }); const n = state(0);
           return <ul id=\"a\" class=\"l\" onClick={() => n.value++}>{posts.value?.map(p => <li key={p.id}><b>{p.title}</b><i>{n.value}</i></li>)}</ul>
         }",
    );
    let variant = &code[code.find("function Feed$shape").expect("a variant")..];
    assert!(variant.contains("$$sr(q)"), "{variant}");
    assert!(!variant.contains("q({"), "the query isn't called again: {variant}");
    assert!(code.contains("data-skeleton") && variant.contains("p.title"), "{code}");
    assert!(!variant.contains("n.value"), "a dropped local is one bar: {variant}");
    assert!(code.contains("Feed$shape as Feed$shape"), "{code}");
}

#[test]
fn a_component_without_a_variant_never_runs() {
    let code = shaped("import { Chart } from 'lib'; export const A = (p) => <div><Chart data={p.x} /></div>");
    let variant = &code[code.find("function A$shape").expect("a variant")..];
    assert!(!variant.contains("Chart"), "{variant}");
    assert!(code.contains("data-skeleton"), "{code}");
}

#[test]
fn imported_variants_come_from_options_shapes() {
    let mut known = std::collections::HashMap::new();
    known.insert("/app/Row#Row".to_string(), true);
    let opts = Options { filename: "/app/App.tsx".into(), shapes: Some(known), ..Default::default() };
    let src = "import { Row } from './Row'; import { Other } from './Other'; export const A = (p) => <div><Row a={p.a} on={1} onClick={p.f} /><Other /></div>";
    let code = compile(src, &opts).code.expect("compiled");
    assert!(code.contains("Row$shape as Row$$v"), "{code}");
    assert!(!code.contains("Other$shape"), "only what exists is imported: {code}");
}

#[test]
fn pending_shape_is_lowered_with_no_options() {
    let src = "import { Boundary } from 'weft'; function Feed() { return <p>{1 + 1}</p> } export function P() { return <Boundary pending=\"shape\"><Feed /></Boundary> }";
    let (code, d) = run(src);
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("$$site0"), "{code}");
    assert!(!code.contains("\"shape\""), "{code}");
    assert!(code.contains("skeleton-scope"), "{code}");
}

#[test]
fn check_reports_exported_variants() {
    let src = "export function A() { return <p /> } export const B = () => <p />; function C() { return <p /> } export { C as D }; export default function E() { return <p /> } export function f() { return 1 }";
    let opts = Options { check_only: true, ..Default::default() };
    let mut names = compile(src, &opts).facts.shapes;
    names.sort();
    assert_eq!(names, ["A", "B", "D", "default"]);
}

#[test]
fn a_rewritten_name_as_a_tag_is_read_live() {
    let (row, d) = run("const ns = {}; export const C = (p) => <ul>{p.xs.map(g => <li key={g.id}><g.icon class=\"x\" /><g.meta.icon /><ns.Icon /></li>)}</ul>;");
    assert!(d.is_empty(), "{d:?}");
    assert!(row.contains("_$component(g().icon, { class: \"x\" })"), "{row}");
    assert!(row.contains("_$component(g().meta.icon, {})"), "{row}");
    assert!(row.contains("_$component(ns.Icon, {})"), "{row}");
    assert!(!row.contains("_$tag"), "{row}");

    let (entries, _) = run("export const C = (p) => <ul>{p.xs.map(({ id, ui, Icon }) => <li key={id}><ui.Icon /><Icon /></li>)}</ul>;");
    assert!(entries.contains("_$component(_item().ui.Icon, {})"), "{entries}");
    assert!(entries.contains("_$component(_item().Icon, {})"), "{entries}");

    let (props, _) = run("export function C({ ui, Icon = Dot, ...rest }) { return <p><ui.Icon /><Icon /><rest.Icon /></p>; }");
    assert!(props.contains(".ui.Icon, {})"), "{props}");
    assert!(props.contains("=== undefined ? Dot :"), "{props}");
    assert!(!props.contains("_$component(ui.Icon") && !props.contains("_$component(Icon") && !props.contains("_$component(rest.Icon"), "{props}");

    let dev = compile("export const C = (p) => <ul>{p.xs.map(g => <li key={g.id}><g.icon /></li>)}</ul>;", &Options { filename: "App.tsx".into(), dev: true, ..Default::default() });
    assert!(dev.code.unwrap().contains("_$component(g().icon, {}, \"g.icon\", \"App.tsx:1\")"));
}

// ---- React prop names ------------------------------------------------------------------------------------------

#[test]
fn react_names_compile_to_attributes() {
    let (code, _) = run(r##"export const A = () => <svg tabIndex={0} viewBox="0 0 1 1" focusable={false}><path strokeWidth="2" clipPath="url(#a)" /><use xlinkHref="#a" /></svg>"##);
    for out in ["tabindex=", "stroke-width=", "clip-path=", "xlink:href=", r#"focusable=\"false\""#] {
        assert!(code.contains(out), "{out}: {code}");
    }
    // negative controls: a case-sensitive attribute keeps its case, and the React spelling is gone
    assert!(code.contains("viewBox="), "{code}");
    assert!(!code.contains("strokeWidth") && !code.contains("tabIndex"), "{code}");
}

#[test]
fn react_names_compile_for_the_server_and_dynamic_values() {
    let source = "export const A = (p) => <input tabIndex={p.i} defaultValue={p.v} defaultChecked={p.c} />";
    let ssr = compile(source, &Options { filename: "App.tsx".into(), generate: "ssr".into(), ..Default::default() }).code.unwrap();
    for out in [r#"("tabindex", "#, r#"("value", "#, r#"("checked", "#] {
        assert!(ssr.contains(out), "{out}: {ssr}");
    }
    let (dom, _) = run(source);
    assert!(dom.contains(".defaultValue = ") && dom.contains(".defaultChecked = "), "{dom}");
}

#[test]
fn react_events_compile_to_their_dom_events() {
    let (code, _) = run("export const A = (p) => <input onDoubleClick={p.a} onClickCapture={p.b} onChange={p.c} onGotPointerCapture={p.d} />");
    assert!(code.contains(r#""dblclick""#), "{code}");
    assert!(code.contains(r#".addEventListener("click", "#) && code.contains(", true);"), "{code}");
    assert!(code.contains("_$change("), "{code}");
    assert!(code.contains(r#""gotpointercapture""#), "{code}");
}

#[test]
fn inner_html_and_form_values_compile_as_content() {
    let (code, _) = run(r#"export const A = (p) => <div><p dangerouslySetInnerHTML={p.raw} /><textarea value="a" /></div>"#);
    assert!(code.contains("?.__html"), "{code}");
    assert!(!code.contains("dangerouslySetInnerHTML"), "{code}");
    assert!(code.contains(r#"_$bind(() => ("a")"#) && code.contains(".value = v"), "{code}");
}

// ---- partial hydration: what says when an island can wait ----------------------------------------------------------

fn node(source: &str, name: &str) -> weft_compiler::hydration::Node {
    let out = compile(source, &Options { filename: "App.tsx".into(), check_only: true, ..Default::default() });
    out.facts.hydration.nodes.into_iter().find(|n| n.name == name).expect("node")
}

#[test]
fn facts_name_globals_outside_handlers_only() {
    let n = node("export function A() { const x = window.matchMedia('(a)'); document.title = 'x'; return <button onClick={() => localStorage.clear()}>{x.matches}</button> }", "A");
    assert!(n.globals.contains(&"matchMedia".to_string()), "{:?}", n.globals);
    assert!(n.globals.contains(&"document".to_string()), "{:?}", n.globals);
    assert!(!n.globals.contains(&"localStorage".to_string()), "a handler waits for its event: {:?}", n.globals);
}

#[test]
fn facts_name_what_cannot_wait() {
    assert!(node("export const A = () => <input autofocus />", "A").early.unwrap().contains("autofocus"));
    assert!(node("export const A = () => <div ref={el => el.focus()} />", "A").early.unwrap().contains("ref"));
    assert!(node("export function A() { let e; return <div ref={el => { e = el }} /> }", "A").early.is_none());
    assert!(node("export function A() { let e; const go = () => e.focus(); return <div ref={e} onClick={go} /> }", "A").globals.contains(&".focus".to_string()));
}

#[test]
fn facts_tell_a_box_from_a_function_and_see_calls() {
    let src = "import { state } from 'weft'\nimport { list } from './server/x'\nexport const cart = state(0)\nexport const A = () => <p onClick={() => list()}>{list().value}</p>\nexport const B = () => <p onClick={() => list()}>b</p>";
    assert!(node(src, "cart").value);
    assert!(!node(src, "A").value);
    assert_eq!(node(src, "A").calls, vec!["list"]);
    assert!(node(src, "B").calls.is_empty(), "a handler's calls wait for it");
}

#[test]
fn the_visible_hatch_is_a_force() {
    assert_eq!(node("/* @weft visible */\nexport const A = () => <p onClick={() => 1} />", "A").force.as_deref(), Some("visible"));
}

#[test]
fn an_island_mark_carries_when_it_loads() {
    let opts = Options {
        filename: "App.tsx".into(),
        generate: "ssr".into(),
        hydratable: true,
        islands: Some(serde_json::from_str(r#"{"id":"a.tsx","sites":[{"index":0,"hoist":false,"when":"i"}]}"#).unwrap()),
        ..Default::default()
    };
    let code = compile("import { C } from './c'\nexport const A = () => <C />", &opts).code.unwrap();
    assert!(code.contains(r#"void 0, "i")"#), "{code}");
}

#[test]
fn a_fragment_of_one_expression_can_follow_a_logical_operator() {
    let (code, d) = run("export function A(p: any) { return <div>{p.c && <>{p.x}</>}{p.c || <>{p.y}</>}</div> }");
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("_c() && (() => (p.x))"), "{code}");
    assert!(code.contains("_c() || (() => (p.y))"), "{code}");
}
