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
    assert!(code.contains("_$createComponent(_$For"), "{code}");
    assert!(code.contains("by: (x) => x.id"), "key stays raw in `by`: {code}");
    assert!(code.contains("x().name"), "row reads the live item: {code}");
    assert!(!code.contains("key"), "key attribute removed: {code}");
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
    assert!(code.contains("_$For") && !code.contains("by:"), "{code}");
}

#[test]
fn list_inside_conditional() {
    let (code, _) = run("export function L({ xs, on }) { return <div>{on ? xs.map(x => <p key={x.id}>{x.n}</p>) : null}</div> }");
    assert!(code.contains("_$For"), "{code}");
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
    let out = compile(TWO_LINES, &Options { filename: "App.tsx".into(), backend: "weft".into(), explain: true, ..Default::default() });
    let explain = out.explain.expect("explain");
    let ul = explain.iter().find(|x| x.line == 3).expect("an entry on line 3");
    assert_eq!((ul.column, ul.node.as_str()), (5, "<ul>"));
    assert!(ul.code.contains("_$tpl(\"<ul><li title=\\\"x\\\"></li></ul>\")") && ul.code.contains("_$child("), "{}", ul.code);
}

#[test]
fn dev_templates_name_their_source_line() {
    let out = compile(TWO_LINES, &Options { filename: "App.tsx".into(), backend: "weft".into(), dev: true, ..Default::default() });
    let code = out.code.unwrap();
    assert!(code.contains("// App.tsx:3 <ul>\n"), "{code}");
    assert!(code.contains(", false, \"App.tsx:3 <ul>\")"), "{code}");
    let prod = compile(TWO_LINES, &Options { filename: "App.tsx".into(), backend: "weft".into(), ..Default::default() }).code.unwrap();
    assert!(!prod.contains("App.tsx:3"), "{prod}");
}
