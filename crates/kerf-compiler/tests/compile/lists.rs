#[test]
fn alias_passed_to_a_helper_in_the_body_is_still_one_read() {
    let (_, d) = run(
        "export function A(props) { const a = props.a; const c = makeChart(a); return <p>{c}</p> }",
    );
    assert_eq!(codes(&d), ["W001"]);
    let (_, d) = run(
        "import { state } from '@kerf-js/core'; export function A(props) { const a = props.a; const s = state(a); return <p>{s.value}</p> }",
    );
    assert_eq!(codes(&d), ["W005"]);
}

#[test]
fn alias_children_is_the_memo() {
    let code =
        clean("export function A(props) { const kids = props.children; return <div>{kids}</div> }");
    assert!(code.contains("_children()"), "{code}");
}

#[test]
fn alias_a_list_over_it_is_keyed() {
    let code = clean(
        "export function A(props) { const items = props.items; return <ul>{items.map(x => <li key={x.id}>{x.id}</li>)}</ul> }",
    );
    assert!(
        code.contains("For") && code.contains("props.items"),
        "{code}"
    );
}

#[test]
fn alias_only_in_components() {
    let code = clean("export function helper(props) { const a = props.a; return a }");
    assert!(code.contains("const a = props.a"), "{code}");
}

#[test]
fn a_rows_key_is_read_once_as_the_row_is_made() {
    let code = clean(
        "export function A(p) { return <ul>{p.xs.map(x => <li key={x.id} class={p.on.get(x.id) ? 'a' : ''} onClick={() => go(x.id)}>{x.t}</li>)}</ul> }",
    );
    assert!(
        code.contains("const _key$ = x().id;")
            && code.contains("p.on.get(_key$)")
            && code.contains("go(_key$)"),
        "{code}"
    );
    assert!(
        code.contains("x().t"),
        "the rest of the row stays live: {code}"
    );
    let code = clean(
        "export function A(p) { return <ul>{p.xs.map(x => <li key={x.id} onClick={() => [].map(x => x().id)} />)}</ul> }",
    );
    assert!(!code.contains("_key$"), "rebound inside: {code}");
}

// ---- W001 / W005 ---------------------------------------------------------------------------------------------

#[test]
fn w001_prop_read_in_setup() {
    let src = "export function A({ items }) { const n = items.length + 1; return <p>{n}</p> }";
    let (_, d) = run(src);
    assert_eq!(codes(&d), ["W001"]);
    assert_eq!(
        apply_fix(src, &d[0]),
        "export function A({ items }) { const n = derived(() => items.length + 1); return <p>{n}</p> }"
    );
    assert!(
        !d[0].fix.as_ref().unwrap().safe,
        "the fix needs `.value` at the use site"
    );
}

#[test]
fn w001_box_value_read_in_setup() {
    let (_, d) = run(
        "import { state } from '@kerf-js/core'; export function A() { const c = state(0); const twice = c.value * 2; return <p>{twice}</p> }",
    );
    assert_eq!(codes(&d), ["W001"]);
}

#[test]
fn w001_helper_call_with_a_prop() {
    let (_, d) = run("export function A({ items }) { makeChart(items); return <p /> }");
    assert_eq!(codes(&d), ["W001"]);
}

#[test]
fn reads_in_jsx_handlers_derived_and_watch_are_fine() {
    let (_, d) = run("import { state, derived, watch } from '@kerf-js/core'
         export function A({ items, onPick }) {
           const q = state('')
           const shown = derived(() => items.filter(i => i.name.includes(q.value)))
           watch(() => q.value, v => console.log(v, items.length))
           const pick = (id) => onPick(id, q.value)
           q.value = 'x'
           return <p onClick={() => pick(1)}>{shown.value.length} {q.value}</p>
         }");
    assert!(d.is_empty(), "{d:?}");
}

#[test]
fn w005_state_of_prop() {
    let src =
        "export function A({ initial }) { const v = state(initial); return <p>{v.value}</p> }";
    let (_, d) = run(src);
    assert_eq!(codes(&d), ["W005"]);
    assert!(apply_fix(src, &d[0]).contains("state.linked(() => initial)"));
}

// ---- §3.4 lists ------------------------------------------------------------------------------------------------

#[test]
fn map_becomes_keyed_list_with_live_item() {
    let (code, d) = run(
        "export function L({ xs }) { return <ul>{xs.map(x => <li key={x.id}>{x.name}</li>)}</ul> }",
    );
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("_$component(For, "), "{code}");
    assert!(
        code.contains("by: (x) => x.id"),
        "key stays raw in `by`: {code}"
    );
    assert!(code.contains("x().name"), "row reads the live item: {code}");
    assert!(!code.contains("key"), "key attribute removed: {code}");
}

#[test]
fn optional_map_is_a_keyed_list() {
    let (code, d) = run(
        "export function L({ xs }) { return <ul>{xs?.map(x => <li key={x.id}>{x.name}</li>)}</ul> }",
    );
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("_$component(For, "), "{code}");
    assert!(code.contains("by: (x) => x.id"), "{code}");
    assert!(code.contains("x().name"), "{code}");
    assert!(
        !code.contains(".map"),
        "no plain `.map` over accessor reads: {code}"
    );

    let src = "import { state } from '@kerf-js/core'\nexport function L() { const posts = state(null); return <ul>{posts.value?.map(p => <li key={p.id}>{p.title}</li>)}</ul> }";
    let (code, d) = run(src);
    assert!(d.is_empty(), "{d:?}");
    assert!(
        code.contains("return posts.value;"),
        "`each` reads the box live: {code}"
    );
    assert!(code.contains("p().title"), "{code}");

    let (code, _) =
        run("export function L({ xs }) { return <ul>{xs?.map(t => <li>{t}</li>)}</ul> }");
    assert!(
        code.contains("_$component(For, "),
        "unkeyed rows too: {code}"
    );
    let (code, _) = run(
        "export function L({ xs }) { return <ul>{xs.map?.(x => <li key={x.id}>{x.n}</li>)}</ul> }",
    );
    assert!(
        code.contains("_$component(For, ") && code.contains("x().n"),
        "{code}"
    );
}

#[test]
fn optional_links_before_map_stay_in_the_list_source() {
    let src = "export function L({ q }) { return <ul>{q?.data.filter(x => x.on).map(x => <li key={x.id}>{x.n}</li>)}</ul> }";
    let (code, _) = run(src);
    assert!(code.contains("_$component(For, "), "{code}");
    assert!(code.contains("q?.data.filter((x) => x.on)"), "{code}");
    assert!(code.contains("x().n"), "{code}");
    let (code, _) = run(
        "export function L({ q }) { return <ul>{q?.data?.map(x => <li key={x.id}>{x.n}</li>)}</ul> }",
    );
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
    assert!(
        code.contains("\"data-id\", _key$);") && !code.contains("() => (_key$)"),
        "{code}"
    );
    assert!(
        code.contains("() => (x().name)") && code.contains("_$bind("),
        "{code}"
    );
    // Hydrating, the attribute stays a binding (it skips the server's value; a write would be a mutation).
    let o = Options {
        filename: "App.tsx".into(),
        hydratable: true,
        ..Default::default()
    };
    let hydratable = compile(src, &o).code.unwrap();
    assert!(
        hydratable.contains("_$bind(() => [_key$, x().name]"),
        "{hydratable}"
    );
    // Other key shapes, and expressions that only contain the key, stay live.
    let (code, _) = run(
        "export function L({ xs }) { return <ul>{xs.map(x => <li key={x.id}>{x.id + 1}</li>)}</ul> }",
    );
    assert!(code.contains("() => (_key$ + 1)"), "{code}");
}

#[test]
fn list_index_is_live() {
    let (code, _) = run(
        "export function L({ xs }) { return <ol>{xs.map((x, i) => <li key={x}>{i + 1}. {x}</li>)}</ol> }",
    );
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
    let (code, d) = run(
        "export function L({ xs }) { return <ul>{xs.map(({ id, name }) => <li key={id}>{name}</li>)}</ul> }",
    );
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("by: ({ id, name }) => id"), "{code}");
    assert!(code.contains("_item().name"), "{code}");
}

#[test]
fn destructured_row_rest_and_nested() {
    let (code, d) = run(
        "export function L({ xs }) { return <ul>{xs.map(([id, { name: [first] }, ...more]) => <li key={id}>{first}{more.length}</li>)}</ul> }",
    );
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("_item()[1].name[0]"), "{code}");
    assert!(code.contains("_item().slice(2).length"), "{code}");
}

#[test]
fn destructured_row_it_cant_bind_is_w019() {
    for row in [
        "({ id, ...more })",
        "({ id, n = 1 })",
        "([id, n = 1])",
        "({ id, [k]: n })",
    ] {
        let (_, d) = run(&format!(
            "const k = 'a'; export function L({{ xs }}) {{ return <ul>{{xs.map({row} => <li key={{id}}>{{id}}</li>)}}</ul> }}"
        ));
        assert!(d.iter().any(|x| x.code == "W019"), "{row}: {d:?}");
    }
}

#[test]
fn destructured_row_tuple() {
    let (code, d) = run(
        "export function L({ xs }) { return <ul>{Object.entries(xs).map(([id, name]) => <li key={id}>{name}</li>)}</ul> }",
    );
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("by: ([id, name]) => id"), "{code}");
    assert!(code.contains("_item()[1]"), "{code}");
}

#[test]
fn primitive_lists_need_no_key() {
    let (code, d) =
        run("export function L({ tags }) { return <ul>{tags.map(t => <li>{t}</li>)}</ul> }");
    assert!(d.is_empty(), "{d:?}");
    assert!(
        code.contains("_$component(For, ") && !code.contains("by:"),
        "{code}"
    );
}

#[test]
fn list_inside_conditional() {
    let (code, _) = run(
        "export function L({ xs, on }) { return <div>{on ? xs.map(x => <p key={x.id}>{x.n}</p>) : null}</div> }",
    );
    assert!(code.contains("_$component(For, "), "{code}");
}

#[test]
fn conditional_row_roots_are_keyed() {
    let (code, d) = run(
        "export function L({ xs }) { return <ul>{xs.map(x => (x.on ? <li key={x.id}>{x.n}</li> : <b key={x.id}>off</b>))}</ul> }",
    );
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("by: (x) => x.id"), "{code}");
    assert!(
        !code.contains("key"),
        "every branch's key is removed: {code}"
    );
}

#[test]
fn fragment_row_roots_are_keyed() {
    let (code, d) = run(
        "export function L({ xs }) { return <dl>{xs.map(x => <><dt key={x.id}>{x.k}</dt><dd>{x.v}</dd></>)}</dl> }",
    );
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("by: (x) => x.id"), "{code}");
    let (code, d) = run(
        "export function L({ xs }) { return <ul>{xs.map(x => x.on && <li key={x.id}>{x.n}</li>)}</ul> }",
    );
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("by: (x) => x.id"), "{code}");
}

#[test]
fn w010_rows_keyed_differently() {
    let (_, d) = run(
        "export function L({ xs }) { return <ul>{xs.map(x => (x.on ? <li key={x.id}>a</li> : <li key={x.name}>b</li>))}</ul> }",
    );
    assert_eq!(codes(&d), ["W010"]);
    assert!(
        d[0].message.contains("keyed differently"),
        "{}",
        d[0].message
    );
}

#[test]
fn w010_fragment_row_without_key() {
    let (_, d) = run(
        "export function L({ xs }) { return <dl>{xs.map(x => <><dt>{x.k}</dt><dd>{x.v}</dd></>)}</dl> }",
    );
    assert_eq!(codes(&d), ["W010"]);
}

#[test]
fn w010_missing_key_with_safe_fix() {
    let src =
        "export function L({ xs }) { return <ul>{xs.map(x => <li>{x.name} {x.id}</li>)}</ul> }";
    let (_, d) = run(src);
    assert_eq!(codes(&d), ["W010"]);
    let fixed = apply_fix(src, &d[0]);
    assert!(fixed.contains("<li key={x.id}>"), "{fixed}");
    assert!(run(&fixed).1.is_empty());
}

#[test]
fn w010_without_an_id_field_has_no_edit() {
    let (_, d) =
        run("export function L({ xs }) { return <ul>{xs.map(x => <li>{x.name}</li>)}</ul> }");
    assert_eq!(codes(&d), ["W010"]);
    assert!(d[0].fix.is_none());
}

#[test]
fn w013_early_return_in_row() {
    let (_, d) = run(
        "export function L({ xs }) { return <ul>{xs.map(x => { if (!x.on) return null; return <li key={x.id} /> })}</ul> }",
    );
    assert!(codes(&d).contains(&"W013"), "{d:?}");
}

// ---- W014: identity-breaking spreads into keyed lists (v3 finding) ---------------------------------------------

#[test]
fn w014_error_when_the_spread_list_is_rendered_by_key_here() {
    let (_, d) = run("import { derived } from '@kerf-js/core'
         export function L({ products, prices }) {
           const merged = derived(() => products.map(p => ({ ...p, price: prices[p.id] ?? p.price })))
           return <ul>{merged.value.map(p => <li key={p.id}>{p.price}</li>)}</ul>
         }");
    assert_eq!(codes(&d), ["W014"]);
    assert_eq!(d[0].severity, Severity::Error);
    assert!(
        d[0].message
            .contains("`merged` is rendered as a keyed list (line 4)"),
        "{}",
        d[0].message
    );
}

#[test]
fn w014_warning_when_the_spread_list_leaves_the_file() {
    let (_, d) = run("import { derived } from '@kerf-js/core'
         export function App({ products, prices }) {
           const merged = derived(() => products.map(p => ({ ...p, price: prices[p.id] })))
           return <List items={merged.value} />
         }");
    assert_eq!(codes(&d), ["W014"]);
    assert_eq!(d[0].severity, Severity::Warning);
}

#[test]
fn w014_not_for_replacing_one_item() {
    let (_, d) = run("import { state } from '@kerf-js/core'
         export function App() {
           const products = state([])
           const push = (id, price) => { products.value = products.value.map(p => (p.id === id ? { ...p, price } : p)) }
           return <ul>{products.value.map(p => <li key={p.id} onClick={() => push(p.id, 1)}>{p.price}</li>)}</ul>
         }");
    assert!(d.is_empty(), "{d:?}");
}

#[test]
fn w014_project_view_upgrades_a_warning_that_reaches_a_keyed_list() {
    let app = compile(
        "import { derived } from '@kerf-js/core'
         import { List as ProductList } from './List'
         export function App({ products, prices }) {
           const merged = derived(() => products.map(p => ({ ...p, price: prices[p.id] })))
           return <ProductList items={merged.value} />
         }",
        &Options {
            filename: "src/App.tsx".into(),
            check_only: true,
            ..Default::default()
        },
    );
    let list = compile(
        "export function List({ items }) { return <ul>{items.map(p => <li key={p.id}>{p.price}</li>)}</ul> }",
        &Options {
            filename: "src/List.tsx".into(),
            check_only: true,
            ..Default::default()
        },
    );
    assert_eq!(app.facts.spread_props.len(), 1, "{:?}", app.facts);
    assert_eq!(
        app.facts.spread_props[0].component, "List",
        "the imported name, not the local alias"
    );
    assert_eq!(list.facts.keyed_props[0].prop, "items");
    let (mut app_d, mut list_d) = (app.diagnostics.clone(), list.diagnostics.clone());
    assert_eq!(
        app_d[0].severity,
        Severity::Warning,
        "per file it stays a warning"
    );
    let mut files = [
        FileView {
            path: "src/App.tsx",
            facts: &app.facts,
            diagnostics: &mut app_d,
        },
        FileView {
            path: "src/List.tsx",
            facts: &list.facts,
            diagnostics: &mut list_d,
        },
    ];
    link_w014(&mut files, |_, spec| {
        (spec == "./List").then(|| "src/List.tsx".to_string())
    });
    assert_eq!(app_d[0].severity, Severity::Error);
    assert!(
        app_d[0]
            .message
            .contains("`<List items>` renders it as a keyed list (src/List.tsx:1)"),
        "{}",
        app_d[0].message
    );
}

#[test]
fn w014_project_view_leaves_unkeyed_targets_alone() {
    let src = "import { derived } from '@kerf-js/core'
         export function Grid(props) { return <p>{props.rows.length}</p> }
         export function Keyed(props) { return <ul>{props.rows.map(r => <li key={r.id} />)}</ul> }
         export function App({ products, prices }) {
           const merged = derived(() => products.map(p => ({ ...p, price: prices[p.id] })))
           return <Grid rows={merged.value} />
         }";
    let out = compile(
        src,
        &Options {
            check_only: true,
            ..Default::default()
        },
    );
    assert_eq!(out.facts.keyed_props.len(), 1, "{:?}", out.facts);
    assert_eq!(
        out.facts.keyed_props[0].component, "Keyed",
        "the `props.rows` form counts"
    );
    let mut d = out.diagnostics.clone();
    link_w014(
        &mut [FileView {
            path: "App.tsx",
            facts: &out.facts,
            diagnostics: &mut d,
        }],
        |_, _| None,
    );
    assert_eq!(
        d[0].severity,
        Severity::Warning,
        "`Grid` doesn't key `rows`"
    );

    let out = compile(
        &src.replace("<Grid rows", "<Keyed rows"),
        &Options {
            check_only: true,
            ..Default::default()
        },
    );
    let mut d = out.diagnostics.clone();
    link_w014(
        &mut [FileView {
            path: "App.tsx",
            facts: &out.facts,
            diagnostics: &mut d,
        }],
        |_, _| None,
    );
    assert_eq!(
        d[0].severity,
        Severity::Error,
        "a same-file component needs no resolver"
    );
}

// ---- W015: a box where JSX needs its value (§11 `.value` question) -------------------------------------------

#[test]
fn w015_bare_box_in_jsx_child_and_native_attribute() {
    let src = "import { state } from '@kerf-js/core'; export function A() { const n = state(0); return <input value={n} title={n.value}>{n}</input> }";
    let (_, d) = run(src);
    assert_eq!(codes(&d), ["W015", "W015"]);
    let mut fixed = src.to_string();
    for diag in d.iter().rev() {
        fixed = apply_fix(&fixed, diag);
    }
    assert!(
        fixed.contains("value={n.value}") && fixed.contains(">{n.value}<"),
        "{fixed}"
    );
    assert!(run(&fixed).1.is_empty());
}

#[test]
fn passing_a_box_to_a_component_is_allowed() {
    let (_, d) = run(
        "import { state } from '@kerf-js/core'; export function A() { const c = state(''); return <CouponInput value={c} /> }",
    );
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
        &Options {
            check_only: true,
            ..Default::default()
        },
    );
    assert!(out.code.is_none());
    assert_eq!(codes(&out.diagnostics), ["W001"]);
}

#[test]
fn diagnostics_have_editor_positions() {
    let (_, d) =
        run("export function A({ items }) {\n  const n = items.length + 1\n  return <p>{n}</p>\n}");
    assert_eq!((d[0].line, d[0].column), (2, 13));
}

#[test]
fn source_maps_point_at_authored_lines() {
    let src = "export function A({ a }) {\n  return <p>{a}</p>\n}\n";
    let out = compile(
        src,
        &Options {
            source_map: true,
            ..Default::default()
        },
    );
    let map = out.map.expect("map");
    assert!(map.contains("\"mappings\""), "{map}");
}

// ---- research 19 step 4: dev comments, explain ---------------------------------------------------------------

const TWO_LINES: &str = "export function A(props: { n: number }) {\n  return (\n    <ul>\n      <li title=\"x\">{props.n}</li>\n    </ul>\n  )\n}";

#[test]
fn explain_maps_each_jsx_node_to_its_authored_line() {
    let out = compile(
        TWO_LINES,
        &Options {
            filename: "App.tsx".into(),
            explain: true,
            ..Default::default()
        },
    );
    let explain = out.explain.expect("explain");
    let ul = explain
        .iter()
        .find(|x| x.line == 3)
        .expect("an entry on line 3");
    assert_eq!((ul.column, ul.node.as_str()), (5, "<ul>"));
    assert!(
        ul.code
            .contains("_$tpl(\"<ul><li title=\\\"x\\\"></li></ul>\")")
            && ul.code.contains("_$child("),
        "{}",
        ul.code
    );
}

#[test]
fn static_aria_booleans_are_written_as_words() {
    // `aria-pressed={false}` means "not pressed", not "not a toggle": ARIA states are the strings true/false.
    let (code, _) = run(
        "export const A = () => <button aria-pressed={false} aria-hidden={true} disabled={false} hidden={true}>x</button>",
    );
    assert!(
        code.contains(r#"<button aria-pressed=\"false\" aria-hidden=\"true\" hidden>"#),
        "{code}"
    );
}

#[test]
fn dev_templates_name_their_source_line() {
    let out = compile(
        TWO_LINES,
        &Options {
            filename: "App.tsx".into(),
            dev: true,
            ..Default::default()
        },
    );
    let code = out.code.unwrap();
    assert!(code.contains("// App.tsx:3 <ul>\n"), "{code}");
    // Only hydratable output passes the place on, to `htpl`'s mismatch warnings.
    assert!(
        code.contains("_$tpl(\"<ul><li title=\\\"x\\\"></li></ul>\")"),
        "{code}"
    );
    let hydratable = compile(
        TWO_LINES,
        &Options {
            filename: "App.tsx".into(),
            dev: true,
            hydratable: true,
            ..Default::default()
        },
    );
    assert!(
        hydratable
            .code
            .unwrap()
            .contains(", false, \"App.tsx:3 <ul>\")")
    );
    let prod = compile(
        TWO_LINES,
        &Options {
            filename: "App.tsx".into(),
            ..Default::default()
        },
    )
    .code
    .unwrap();
    assert!(!prod.contains("App.tsx:3"), "{prod}");
}

#[test]
fn kerf_back_end_source_maps_point_at_the_authored_lines() {
    let source = "import { state } from '@kerf-js/core'\n\nconst helper = () => 1\n\nexport function A() {\n  const count = state(helper())\n  return (\n    <section>\n      <button onClick={() => count.value++}>\n        {count.value * 2}\n      </button>\n    </section>\n  )\n}\n";
    let out = compile(
        source,
        &Options {
            filename: "App.tsx".into(),
            source_map: true,
            ..Default::default()
        },
    );
    let code = out.code.unwrap();
    assert!(
        !code.contains(['\u{E000}', '\u{E001}', '\u{E002}', '\u{E003}']),
        "{code}"
    );
    let json = out.map.expect("a map");
    let map = oxc_sourcemap::SourceMap::from_json_string(&json).unwrap();
    let table = map.generate_lookup_table();
    // (text in the output, its authored line, 1-based)
    for (needle, line) in [
        ("helper = ", 3),
        ("state(helper())", 6),
        ("count.value++", 9),
        ("count.value * 2", 10),
    ] {
        let at = code
            .find(needle)
            .unwrap_or_else(|| panic!("{needle} in {code}"));
        let out_line = code[..at].matches('\n').count() as u32;
        let out_col = code[..at]
            .rsplit('\n')
            .next()
            .unwrap()
            .encode_utf16()
            .count() as u32;
        let t = map
            .lookup_token(&table, out_line, out_col)
            .unwrap_or_else(|| panic!("no token for {needle}"));
        assert_eq!(t.get_src_line() + 1, line, "{needle}\n{code}");
    }
}
