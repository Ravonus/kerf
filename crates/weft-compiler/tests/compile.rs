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
    let (code, _) = run("export function A({ a, ...rest }) { return <div {...rest}>{a}</div> }");
    assert!(code.contains(r#"import { omit as _$omit } from "weft""#), "{code}");
    assert!(code.contains(r#"_$omit(props, ["a"])"#), "{code}");
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

// ---- W001 / W005 ---------------------------------------------------------------------------------------------

#[test]
fn w001_prop_read_in_setup() {
    let src = "export function A({ items }) { const n = items.length; return <p>{n}</p> }";
    let (_, d) = run(src);
    assert_eq!(codes(&d), ["W001"]);
    assert_eq!(apply_fix(src, &d[0]), "export function A({ items }) { const n = derived(() => items.length); return <p>{n}</p> }");
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
fn a_rows_key_is_written_once() {
    // The key can't change while the row lives (a new item under the same key has the same key), so a hole or
    // attribute that is exactly the key gets no effect. Anything else about the item stays live.
    let src = "export function L({ xs }) { return <ul>{xs.map(x => <li key={x.id} data-id={x.id} title={x.name}>{x.id}: {x.name}</li>)}</ul> }";
    let (code, d) = run(src);
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("\"data-id\", x().id);") && !code.contains("() => (x().id)"), "{code}");
    assert!(code.contains("() => (x().name)") && code.contains("_$bind("), "{code}");
    // Hydrating, the attribute stays a binding (it skips the server's value; a write would be a mutation).
    let o = Options { filename: "App.tsx".into(), hydratable: true, ..Default::default() };
    let hydratable = compile(src, &o).code.unwrap();
    assert!(hydratable.contains("_$bind(() => [x().id, x().name]"), "{hydratable}");
    // Other key shapes, and expressions that only contain the key, stay live.
    let (code, _) = run("export function L({ xs }) { return <ul>{xs.map(x => <li key={x.id}>{x.id + 1}</li>)}</ul> }");
    assert!(code.contains("() => (x().id + 1)"), "{code}");
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
        "export function A({ items }) { const n = items.length; return <p>{n}</p> }",
        &Options { check_only: true, ..Default::default() },
    );
    assert!(out.code.is_none());
    assert_eq!(codes(&out.diagnostics), ["W001"]);
}

#[test]
fn diagnostics_have_editor_positions() {
    let (_, d) = run("export function A({ items }) {\n  const n = items.length\n  return <p>{n}</p>\n}");
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
    for (needle, line) in [("helper = ", 3), ("state(helper())", 6), ("count.value++", 9), ("count.value * 2", 10), ("_$on(", 8)] {
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
