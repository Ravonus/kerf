use weft_compiler::project::{FileView, link_w014};
use weft_compiler::{Diagnostic, Options, Severity, compile};

fn run(source: &str) -> (String, Vec<Diagnostic>) {
    let out = compile(
        source,
        &Options {
            filename: "App.tsx".into(),
            ..Default::default()
        },
    );
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
    let (code, d) = run(
        "export function A({ a, b }: { a: number; b: string }) { return <p title={b}>{a}</p> }",
    );
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("export function A(props: {"), "{code}");
    assert!(
        code.contains("props.a") && code.contains("props.b"),
        "{code}"
    );
}

#[test]
fn defaults_apply_on_every_read() {
    let (code, _) = run("export const A = ({ size = 'md' }) => <p class={size} />");
    assert!(
        code.contains(r#"props.size === undefined ? "md" : props.size"#),
        "{code}"
    );
}

#[test]
fn defaults_that_read_other_props_are_rewritten() {
    let (code, d) =
        run("export function A({ a, b = a, c = b + 1 }) { return <p title={c}>{b}</p> }");
    assert!(
        d.is_empty(),
        "defaults are live reads, not setup reads: {d:?}"
    );
    assert!(
        code.contains("props.b === undefined ? props.a : props.b"),
        "{code}"
    );
    assert!(
        code.contains(
            "props.c === undefined ? (props.b === undefined ? props.a : props.b) + 1 : props.c"
        ),
        "{code}"
    );
    assert!(
        !code.contains(" a ") && !code.contains("(a)"),
        "no unbound `a` left: {code}"
    );
}

#[test]
fn defaults_keep_list_and_box_reads_live() {
    let (code, d) = run(
        "import { state } from '@weft-js/core'; const on = state(1); export function A({ n = on.value }) { return <p>{n}</p> }",
    );
    assert!(d.is_empty(), "{d:?}");
    assert!(
        code.contains("props.n === undefined ? on.value : props.n"),
        "{code}"
    );
}

#[test]
fn rest_props_stay_live() {
    // on an element: a plain copy, read by the element's one spread binding (no view, no merged object)
    let (code, _) = run("export function A({ a, ...rest }) { return <div {...rest}>{a}</div> }");
    assert!(
        code.contains(r#"import { restOf as _$restOf } from "@weft-js/core""#),
        "{code}"
    );
    assert!(
        code.contains(r#"_$spread(_e1, () => ({ ..._$restOf(props, ["a"]) }))"#),
        "{code}"
    );
    assert!(
        !code.contains("_$omit") && !code.contains("_$mergeProps"),
        "{code}"
    );
    // passed on as a value: one live view
    let (code, _) = run("export function A({ a, ...rest }) { return <B {...rest} a={a} /> }");
    assert!(
        code.contains(r#"const _rest = _$omit(props, ["a"])"#),
        "{code}"
    );
    assert!(code.contains("_$mergeProps(_rest, "), "{code}");
}

#[test]
fn element_spreads_read_their_attributes_in_order() {
    let (code, _) = run(
        "export function A(props: any) { return <a title=\"t\" {...props.attrs} href={props.href} {...props}>x</a> }",
    );
    assert!(
        code.contains(
            r#"_$spread(_e1, () => ({ title: "t", ...props.attrs, href: props.href, ...props }))"#
        ),
        "{code}"
    );
    // without JSX children, the merged props' `children` is the element's hole
    let (code, _) = run("export function A(props: any) { return <p {...props} /> }");
    assert!(
        code.contains("_$mergeProps(props)") && code.contains("() => _p2.children"),
        "{code}"
    );
}

#[test]
fn jsx_fields_of_an_object_prop_are_getters() {
    // reading `b.name` must not build a <Logo>: one built where it isn't rendered takes another node's hydration key
    let (code, _) = run(
        "function Logo() { return <svg /> }\nexport function A(props: any) { return <Shell brand={{ name: 'x', ...props.b, mark: <Logo /> }} /> }",
    );
    assert!(
        code.contains(
            "get brand() { return { name: \"x\", ...props.b, get mark() { return _$component(Logo"
        ),
        "{code}"
    );
    // without JSX fields the object is passed as written
    let (code, _) =
        run("export function A(props: any) { return <Shell brand={{ name: props.n }} /> }");
    assert!(
        code.contains("get brand() { return { name: props.n }; }"),
        "{code}"
    );
}

#[test]
fn props_object_form_is_left_alone() {
    let (code, d) = run("export function A(props: { a: number }) { return <p>{props.a}</p> }");
    assert!(d.is_empty());
    assert!(code.contains("props.a"));
}

#[test]
fn shorthand_properties_are_expanded() {
    let (code, _) =
        run("export function A({ a, f }) { return <button onClick={() => f({ a })}>x</button> }");
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
    assert!(
        code.contains("props.user.name"),
        "still compiled live: {code}"
    );
    let fix = d[0].fix.as_ref().unwrap();
    assert!(fix.safe);
    let fixed = apply_fix(src, &d[0]);
    assert_eq!(
        fixed,
        "export function A({ user }) { return <p>{user.name}</p> }"
    );
    assert!(run(&fixed).1.is_empty());
}

// ---- §3.3 children --------------------------------------------------------------------------------------------

#[test]
fn children_are_memoised_once_per_component() {
    let (code, d) = run(
        "export function Box({ title, children }) { return <div><h2>{title}</h2>{children}{children}</div> }",
    );
    assert!(d.is_empty(), "{d:?}");
    assert!(
        code.contains(r#"import { memo as _$weftMemo } from "@weft-js/core""#),
        "{code}"
    );
    assert_eq!(
        code.matches("_$weftMemo(() => props.children)").count(),
        1,
        "{code}"
    );
    assert_eq!(
        code.matches("_children").count(),
        3,
        "one declaration, two reads: {code}"
    );
    assert!(
        !code.contains("return props.children"),
        "no read bypasses the memo: {code}"
    );
}

#[test]
fn children_memo_in_props_form_and_expression_arrows() {
    let (code, _) = run("export function P(props) { return <div>{props.children}</div> }");
    assert!(
        code.contains("const _children = _$weftMemo(() => props.children);"),
        "{code}"
    );
    let (code, _) = run("export const Card = ({ children }) => <section>{children}</section>");
    assert!(
        code.contains("const _children = _$weftMemo(() => props.children);"),
        "the body becomes a block: {code}"
    );
}

#[test]
fn children_memo_only_when_read() {
    let (code, _) = run("export function A({ children, a }) { return <p>{a}</p> }");
    assert!(
        !code.contains("_$weftMemo") && !code.contains("from \"@weft-js/core\""),
        "{code}"
    );
    let (code, _) = run(
        "export function A({ children }) { const _children = 1; return <p>{children}{_children}</p> }",
    );
    assert!(
        code.contains("const _children$ = _$weftMemo("),
        "avoids the name in use: {code}"
    );
}

// ---- W016: call-expression props (§3.3) ------------------------------------------------------------------------

#[test]
fn w016_call_with_nothing_reactive_in_a_component_prop() {
    let (code, d) = run("render(() => <App api={createFakeApi()} />, root)");
    assert_eq!(codes(&d), ["W016"]);
    assert_eq!(d[0].severity, Severity::Warning);
    assert!(
        d[0].message
            .contains("`createFakeApi` runs again on every read of `api`"),
        "{}",
        d[0].message
    );
    assert!(
        d[0].fix.is_none(),
        "hoisting can't be proven safe without seeing inside the callee"
    );
    assert!(code.contains("get api()"), "codegen is unchanged: {code}");
}

#[test]
fn w016_not_for_live_calls_constructors_or_native_attributes() {
    let (_, d) = run(
        "import { state } from '@weft-js/core'
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
    let (_, d) = run(
        "export function L({ products, cart }) { return <ul>{products.map(p => <Row key={p.id} n={cart[p.id] ?? 0} />)}</ul> }",
    );
    assert_eq!(codes(&d), ["W017"]);
    assert_eq!(d[0].severity, Severity::Warning);
    assert!(
        d[0].message
            .contains("`cart[p.id]` reads one entry of the whole `cart` in every row"),
        "{}",
        d[0].message
    );
    assert!(
        d[0].help.contains("`cart={cart}`") && d[0].help.contains("`cart.get(p.id)`"),
        "{}",
        d[0].help
    );
    assert!(d[0].fix.is_none(), "the parent has to pass the box");
}

#[test]
fn w017_box_value_indexed_by_the_row_item_autofixes_to_get() {
    let src = "import { state } from '@weft-js/core'
export function L({ products }) {
  const cart = state({})
  return <ul>{products.map(p => <li key={p.id}>{cart.value[p.id]} / {cart.value[p.id] * p.price}</li>)}</ul>
}";
    let (_, d) = run(src);
    assert_eq!(codes(&d), ["W017"], "one per object and list: {d:?}");
    let fix = d[0].fix.as_ref().unwrap();
    assert!(fix.safe);
    let fixed = apply_fix(src, &d[0]);
    assert!(
        fixed.contains("{cart.get(p.id)} / {cart.get(p.id) * p.price}"),
        "{fixed}"
    );
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
    let src = "import { derived, type State } from '@weft-js/core'
export function Row({ stock, live }: { stock: { id: string }; live: State<Record<string, { price: number }>> }) {
  const quote = derived(() => live.value[stock.id])
  return <li title={String(live.value[stock.id].price)}>{live.value[stock.id].price} {quote.value.price}</li>
}";
    let (_, d) = run(src);
    assert_eq!(codes(&d), ["W017"], "one per box and component: {d:?}");
    assert!(
        d[0].message
            .contains("`live.value[stock.id]` reads one entry of the whole `live.value`"),
        "{}",
        d[0].message
    );
    assert!(d[0].message.contains("every `Row`"), "{}", d[0].message);
    assert!(
        d[0].help.contains("`live.get(stock.id)`") && d[0].help.contains("`State<…>`"),
        "{}",
        d[0].help
    );
    let fix = d[0].fix.as_ref().unwrap();
    assert!(!fix.safe, "a prop is only probably a box");
    let fixed = apply_fix(src, &d[0]);
    assert!(
        fixed.contains("derived(() => live.get(stock.id))")
            && fixed.contains("{live.get(stock.id).price}"),
        "{fixed}"
    );
    assert!(run(&fixed).1.is_empty());
}

#[test]
fn w017_local_box_indexed_by_a_prop_autofixes_safely() {
    let src = "import { state } from '@weft-js/core'
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
    let src = "import type { State } from '@weft-js/core'
export function List({ stocks, live }: { stocks: { id: string }[]; live: State<Record<string, number>> }) {
  return <ul>{stocks.map(s => <StockRow key={s.id} stock={s} live={live.value[s.id]} />)}</ul>
}";
    let (_, d) = run(src);
    assert_eq!(codes(&d), ["W017"]);
    assert!(
        d[0].message
            .contains("`live.value[s.id]` reads one entry of the whole `live.value` in every row"),
        "{}",
        d[0].message
    );
    assert!(
        d[0].help.contains("`live={live.get(s.id)}`") && d[0].help.contains("in `<StockRow>`"),
        "{}",
        d[0].help
    );
    assert!(!d[0].fix.as_ref().unwrap().safe);
    let fixed = apply_fix(src, &d[0]);
    assert!(fixed.contains("live={live.get(s.id)}"), "{fixed}");
    assert!(run(&fixed).1.is_empty());
    // A plain prop passed down names the child too.
    let (_, d) = run(
        "export function L({ xs, cart }) { return <ul>{xs.map(x => <Row key={x.id} n={cart[x.id]} />)}</ul> }",
    );
    assert_eq!(codes(&d), ["W017"]);
    assert!(
        d[0].help.contains("`cart={cart}`") && d[0].help.contains("in `<Row>`"),
        "{}",
        d[0].help
    );
}

#[test]
fn w017_not_for_box_keys_callbacks_handlers_setup_or_constant_keys() {
    // The v4 reference App: whole-record reads that run once per component, not once per row.
    let (_, d) = run(
        "import { derived, state, untrack, type State } from '@weft-js/core'
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
    let src = "import { untrack, type State } from '@weft-js/core'
export function Row({ stock, live }: { stock: { id: string }; live: State<Record<string, { price: number }>> }) {
  const quote = untrack(() => live.get(stock.id))
  return <li data-price={quote.price}>{quote.price}</li>
}";
    let (_, d) = run(src);
    assert_eq!(codes(&d), ["W018"]);
    assert_eq!(d[0].severity, Severity::Warning);
    assert!(
        d[0].message.contains("`quote` is an untracked snapshot"),
        "{}",
        d[0].message
    );
    assert!(
        d[0].help.contains("`derived(() => …)`") && d[0].help.contains("`quote.value`"),
        "{}",
        d[0].help
    );
    let fix = d[0].fix.as_ref().unwrap();
    assert!(!fix.safe);
    let fixed = apply_fix(src, &d[0]);
    assert!(
        fixed.contains("const quote = derived(() => live.get(stock.id))")
            && fixed.contains("{quote.value.price}"),
        "{fixed}"
    );
    assert!(
        run(&fixed.replace("import { untrack,", "import { derived,"))
            .1
            .is_empty()
    );
}

#[test]
fn w018_not_for_snapshots_read_elsewhere_or_of_constants() {
    let (_, d) = run("import { state, untrack } from '@weft-js/core'
export function Form({ initial }: { initial: string }) {
  const text = state('')
  const start = untrack(() => initial)
  const fixed = untrack(() => 42)
  return <p onClick={() => (text.value = start)}>{start} {fixed}</p>
}");
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
    let code =
        clean("export function A(props) { const amount = props.amount; return <p>{amount}</p> }");
    assert!(code.contains("props.amount"), "{code}");
    assert!(!code.contains("amount = props"), "no copy is left: {code}");
    assert!(code.contains("() =>"), "a live hole: {code}");
}

#[test]
fn alias_paths_chains_and_casts() {
    let code = clean(
        "export function A(props: any) { const u = props.user as any; const name = u.name!; const n = props.items.length; return <p>{name}{n}</p> }",
    );
    assert!(
        code.contains("props.user.name") && code.contains("props.items.length"),
        "{code}"
    );
}

#[test]
fn alias_of_a_destructured_param() {
    let code = clean(
        "export function A({ items, size = 2 }) { const n = items.length; const s = size; return <p>{n}{s}</p> }",
    );
    assert!(code.contains("props.items.length"), "{code}");
    assert!(
        code.contains("props.size === undefined ? 2 : props.size"),
        "{code}"
    );
}

#[test]
fn alias_destructuring_renames_defaults_and_rest() {
    let code = clean(
        "export function A(props) { const { amount: a, label = 'x', ...rest } = props; return <p {...rest} title={rest.t}>{a}{label}</p> }",
    );
    assert!(
        code.contains("props.amount")
            && code.contains("props.label === undefined ? \"x\" : props.label"),
        "{code}"
    );
    assert!(
        code.contains("_$restOf(props, [\"amount\", \"label\"])") && code.contains("props.t"),
        "{code}"
    );
}

#[test]
fn alias_default_seen_by_a_closure_above_it() {
    let code = clean(
        "export function A(props) { function f() { return b } const { b = 1 } = props; return <button onClick={f} /> }",
    );
    assert!(
        code.contains("props.b === undefined ? 1 : props.b"),
        "{code}"
    );
}

#[test]
fn alias_shadowing_is_by_binding_not_name() {
    let code = clean(
        "export function A(props) { const a = props.a; const f = (a) => a + 1; return <p onClick={() => f(a)}>{a}</p> }",
    );
    assert!(
        code.contains("(a) => a + 1") && code.contains("f(props.a)"),
        "{code}"
    );
}

#[test]
fn alias_refused_when_a_closure_shadows_the_props_name() {
    let (_, d) = run(
        "export function A(props) { const a = props.a; const f = (props) => a + props; return <p onClick={f} /> }",
    );
    assert_eq!(
        codes(&d),
        ["W001"],
        "`props` at the use would be the wrong one"
    );
}

#[test]
fn alias_keeps_shorthand_and_other_declarators() {
    let code = clean(
        "export function A(props) { const a = props.a, b = 1; const o = () => ({ a, b }); return <p onClick={o} /> }",
    );
    assert!(
        code.contains("a: props.a") && code.contains("b = 1"),
        "{code}"
    );
}

#[test]
fn alias_let_never_written_is_fine() {
    let code = clean("export function A(props) { let a = props.a; return <p>{a}</p> }");
    assert!(code.contains("props.a"), "{code}");
}

#[test]
fn alias_written_is_a_local_override() {
    let code = clean(
        "export function A(props) { let a = props.a; const f = () => { a = 2; a += 1; a++ }; return <p onClick={f}>{a}</p> }",
    );
    assert!(
        code.contains("props = _$localProps(props, [\"a\", 0])"),
        "{code}"
    );
    assert!(
        code.contains("props.a = 2") && code.contains("props.a += 1") && code.contains("props.a++"),
        "{code}"
    );
    let code = clean(
        "export function A(props) { let { a = 1 } = props; return <p onClick={() => a++}>{a}</p> }",
    );
    assert!(
        code.contains("_$localProps(props, [\"a\", () => 1])") && !code.contains("undefined"),
        "{code}"
    );
    let code = clean("export function A({ a }) { return <p onClick={() => { a = 2 }}>{a}</p> }");
    assert!(
        code.contains("_$localProps"),
        "a written parameter too: {code}"
    );
}

#[test]
fn alias_const_stays_read_only() {
    for src in [
        "export function A(props) { const a = props.a; return <p onClick={() => { a = 2 }}>{a}</p> }",
        "export function A(props) { const { a } = props; return <p onClick={() => { a++ }}>{a}</p> }",
    ] {
        let (_, d) = run(src);
        assert_eq!(codes(&d), ["W001"], "{src}");
        assert!(
            d[0].help.contains("`let`") && d[0].help.contains("props"),
            "{}",
            d[0].help
        );
    }
}

#[test]
fn props_write_is_the_same_override() {
    let code = clean(
        "export function A(props) { return <p onClick={() => { props.a = 2; props.b++ }}>{props.a}</p> }",
    );
    assert!(
        code.contains("_$localProps(props, [ \"a\", 0, \"b\", 0 ])"),
        "{code}"
    );
    let code = clean(
        "export function A(props) { const f = () => { props.user.name = 1 }; return <p onClick={f} /> }",
    );
    assert!(
        !code.contains("_$localProps"),
        "a deeper write is the object's: {code}"
    );
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
    let code = clean(
        "import { bind, state } from '@weft-js/core'; export function A() { const n = state(1); return <C n={bind(n)} m={n.value} /> }",
    );
    assert!(
        code.contains("get n() { return n.value; }, set n(_v) { n.value = _v; }"),
        "{code}"
    );
    assert!(!code.contains("set m"), "{code}");
}

#[test]
fn bind_attribute_is_the_same_binding() {
    let code = clean(
        "import { state } from '@weft-js/core'; export function A() { const count = state(1); return <C bind:count={count} /> }",
    );
    assert!(
        code.contains("get count() { return count.value; }, set count(_v) { count.value = _v; }"),
        "{code}"
    );
    assert!(!code.contains("bind:count"), "{code}");
    let code = clean("export function A(props) { return <C bind:n={props.box} /> }");
    assert!(
        code.contains("set n(_v) { props.box.value = _v; }"),
        "{code}"
    );
    for src in [
        "import { state } from '@weft-js/core'; export function A() { const n = state(1); return <input bind:value={n} /> }",
        "export function A() { return <C bind:n={1} /> }",
        "export function A() { return <C bind:n /> }",
    ] {
        let (_, d) = run(src);
        assert!(codes(&d).contains(&"W061"), "{src}");
    }
}

#[test]
fn bind_outside_a_component_prop_is_w061() {
    for src in [
        "import { bind, state } from '@weft-js/core'; export function A() { const n = state(1); return <input value={bind(n)} /> }",
        "import { bind, state } from '@weft-js/core'; export function A() { const n = state(1); const v = bind(n); return <p /> }",
        "import { bind } from '@weft-js/core'; export function A() { return <C n={bind(1)} /> }",
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
