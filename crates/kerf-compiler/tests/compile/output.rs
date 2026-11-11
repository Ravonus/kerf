#[test]
fn only_hydratable_output_imports_the_claiming_helpers() {
    let imports = |hydratable| {
        let code = compile(
            TWO_LINES,
            &Options {
                filename: "App.tsx".into(),
                hydratable,
                ..Default::default()
            },
        )
        .code
        .unwrap();
        code.lines().next().unwrap().to_string()
    };
    let client = imports(false);
    assert!(
        client.contains("tpl as _$tpl") && client.contains("child as _$child"),
        "{client}"
    );
    assert!(
        !client.contains("htpl") && !client.contains("hchild") && !client.contains("first"),
        "{client}"
    );
    let hydratable = imports(true);
    assert!(
        hydratable.contains("htpl as _$htpl") && hydratable.contains("hchild as _$hchild"),
        "{hydratable}"
    );
    assert!(
        !hydratable.contains("tpl as _$tpl,") && !hydratable.contains(" child as _$child"),
        "{hydratable}"
    );
}

#[test]
fn content_properties_render_on_the_server_and_refuse_children() {
    let ssr = |src: &str| {
        compile(
            src,
            &Options {
                filename: "App.tsx".into(),
                generate: "ssr".into(),
                ..Default::default()
            },
        )
    };
    let code = ssr("export const A = (p: any) => <p textContent={p.s} />")
        .code
        .unwrap();
    assert!(
        code.contains("\">\" + _$escape(String((p.s) ?? \"\")) + \"</p>\""),
        "{code}"
    );
    let code = ssr("export const A = (p: any) => <div innerHTML={p.h} />")
        .code
        .unwrap();
    assert!(
        code.contains("\">\" + String((p.h) ?? \"\") + \"</div>\""),
        "{code}"
    );
    let out = compile(
        "export const A = (p: any) => <p textContent={p.s}>x</p>",
        &Options {
            filename: "App.tsx".into(),
            ..Default::default()
        },
    );
    assert!(
        out.code.is_none()
            && out.diagnostics[0]
                .message
                .contains("can't also have children"),
        "{:?}",
        out.diagnostics
    );
}

// ---- HMR (research 21) -----------------------------------------------------------------------------------------

fn hot(source: &str) -> String {
    let o = Options {
        filename: "/app/Card.tsx".into(),
        dev: true,
        hmr: true,
        ..Default::default()
    };
    compile(source, &o).code.unwrap_or_default()
}

#[test]
fn hmr_registers_components_and_keeps_body_state() {
    let code = hot(
        "import { state } from '@kerf-js/core'\nexport function Card() { const open = state(false); return <p>{open.value}</p> }\nconst Row = () => <li />",
    );
    assert!(
        code.contains(r#"_$keep(state(false), "Card", "open:"#),
        "{code}"
    );
    assert!(
        code.contains(r#"import { hot as _$hot, keep as _$keep } from "@kerf-js/core/hmr";"#),
        "{code}"
    );
    assert!(
        code.contains(r#"_$hot("/app/Card.tsx", { Card: [Card, ""#) && code.contains("Row: [Row, "),
        "{code}"
    );
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
    assert!(
        !hot("export const total = 1\nexport function C() { return <i /> }").contains("accept()")
    );
    assert!(!hot("import { render } from '@kerf-js/core/dom'\nfunction App() { return <i /> }\nrender(() => <App />, document.body)").contains("accept()"));
    assert!(
        hot("function App() { return <i /> }\nexport default App\nexport type P = { a: 1 }")
            .contains("accept()")
    );
}

#[test]
fn hmr_is_dev_dom_only() {
    let src = "export function C() { const n = state(0); return <i>{n.value}</i> }";
    for o in [
        Options {
            dev: false,
            hmr: true,
            ..Default::default()
        },
        Options {
            dev: true,
            hmr: false,
            ..Default::default()
        },
        Options {
            dev: true,
            hmr: true,
            generate: "ssr".into(),
            ..Default::default()
        },
    ] {
        let code = compile(src, &o).code.unwrap();
        assert!(
            !code.contains("@kerf-js/core/hmr") && !code.contains("_$keep"),
            "{code}"
        );
    }
    // A Start app hydrates in dev too, and keeps the page across a save.
    let hydrated = compile(
        src,
        &Options {
            dev: true,
            hmr: true,
            hydratable: true,
            ..Default::default()
        },
    )
    .code
    .unwrap();
    assert!(hydrated.contains("@kerf-js/core/hmr"), "{hydrated}");
    assert!(
        !hot("const x = 1").contains("@kerf-js/core/hmr"),
        "no components, no registration"
    );
}

// ---- veneer findings (research 24 §6) ----------------------------------------------------------------------------

#[test]
fn an_import_after_jsx_compiles() {
    for o in [
        Options::default(),
        Options {
            hydratable: true,
            ..Default::default()
        },
        Options {
            generate: "ssr".into(),
            ..Default::default()
        },
    ] {
        let out = compile(
            "// a — b\nexport const A = () => <p>— x</p>\nimport { state } from '@kerf-js/core'\nexport const B = () => <i>{state(1).value}</i>",
            &o,
        );
        let code = out.code.expect("compiles");
        assert!(
            code.contains(r#"import { state } from "@kerf-js/core""#),
            "{code}"
        );
        assert_eq!(
            code.matches("_$tpl(").count() + code.matches("_$htpl(").count(),
            if o.generate == "ssr" { 0 } else { 2 },
            "{code}"
        );
    }
}

#[test]
fn w001_not_on_a_rest_alias() {
    // a rest parameter is a live view of the props: holding it is not a read
    let (_, d) =
        run("export function A({ a, ...rest }: any) { const x = rest; return <p {...x}>{a}</p> }");
    assert!(d.is_empty(), "{d:?}");
    let (_, d) = run(
        "export function A({ a, ...rest }: any) { const x = rest.title + '!'; return <p title={x}>{a}</p> }",
    );
    assert_eq!(codes(&d), ["W001"], "a member of rest is a prop read");
    let (code, d) = run(
        "export function A({ a, ...rest }: any) { const x = rest.title; const y = rest.a; return <p title={x}>{a}{y}</p> }",
    );
    assert_eq!(codes(&d), ["W001"], "`a` isn't in rest: {code}");
    let (code, d) = run(
        "export function A({ a, ...rest }: any) { const x = rest.title; return <p title={x}>{a}</p> }",
    );
    assert!(d.is_empty() && code.contains("props.title"), "{code}");
}

#[test]
fn a_rest_parameter_is_one_view_however_often_it_is_used() {
    let (code, _) = run(
        "export function A({ a, ...rest }: any) { const f = () => rest.x; watch(() => rest, () => {}); return <B {...rest} y={rest.y}>{a}</B> }",
    );
    assert_eq!(code.matches("_$omit(").count(), 1, "{code}");
}

#[test]
fn ref_to_a_const_or_an_import_calls_it() {
    let src = "import { register } from './reg'\nconst local = (el: Element) => el\nexport function A() { let mine; return <div><p ref={register}>x</p><i ref={local}>y</i><b ref={mine}>z</b></div> }";
    let (code, _) = run(src);
    assert!(
        !code.contains("register = ") && !code.contains("local = _"),
        "no assignment to a const or an import: {code}"
    );
    assert!(
        code.contains("mine = _e"),
        "a `let` is still assigned: {code}"
    );
}

#[test]
fn ref_to_a_variable_beside_a_spread_assigns_it() {
    let (code, _) =
        run("export function A(props: any) { let el: any; return <p ref={el} {...props}>x</p> }");
    assert!(code.contains("el = _"), "{code}");
    let (code, _) = run(
        "import { register } from './reg'\nexport function A(props: any) { return <p ref={register} {...props}>x</p> }",
    );
    assert!(!code.contains("register = "), "{code}");
}

#[test]
fn a_key_on_the_index_parameter_keys_by_position() {
    let (code, _) = run(
        "export function L({ xs }: any) { return <ul>{xs.map((x: any, i: number) => <li key={i}>{x.name}</li>)}</ul> }",
    );
    assert!(code.contains("by: (x, i) => i"), "{code}");
}

// ---- shape variants (research 31 §5) ---------------------------------------------------------------------------

fn shaped(source: &str) -> String {
    let opts = Options {
        filename: "/app/App.tsx".into(),
        shapes: Some(std::collections::HashMap::default()),
        ..Default::default()
    };
    compile(source, &opts).code.expect("compiled")
}

#[test]
fn no_variants_unless_asked() {
    let (code, _) = run("export function A() { return <p>{1}</p> }");
    assert!(
        !code.contains("$shape") && !code.contains("@kerf-js/core/shape"),
        "{code}"
    );
}

#[test]
fn a_variant_keeps_markup_and_drops_behaviour() {
    let code = shaped(
        "import { q } from './q'; import { state } from '@kerf-js/core';
         export function Feed() {
           const posts = q({ limit: 5 }); const n = state(0);
           return <ul id=\"a\" class=\"l\" onClick={() => n.value++}>{posts.value?.map(p => <li key={p.id}><b>{p.title}</b><i>{n.value}</i></li>)}</ul>
         }",
    );
    let variant = &code[code.find("function Feed$shape").expect("a variant")..];
    assert!(variant.contains("$$sr(q)"), "{variant}");
    assert!(
        !variant.contains("q({"),
        "the query isn't called again: {variant}"
    );
    assert!(
        code.contains("data-skeleton") && variant.contains("p.title"),
        "{code}"
    );
    assert!(
        !variant.contains("n.value"),
        "a dropped local is one bar: {variant}"
    );
    assert!(code.contains("Feed$shape as Feed$shape"), "{code}");
}

#[test]
fn a_component_without_a_variant_never_runs() {
    let code = shaped(
        "import { Chart } from 'lib'; export const A = (p) => <div><Chart data={p.x} /></div>",
    );
    let variant = &code[code.find("function A$shape").expect("a variant")..];
    assert!(!variant.contains("Chart"), "{variant}");
    assert!(code.contains("data-skeleton"), "{code}");
}

#[test]
fn imported_variants_come_from_options_shapes() {
    let mut known = std::collections::HashMap::new();
    known.insert("/app/Row#Row".to_string(), true);
    let opts = Options {
        filename: "/app/App.tsx".into(),
        shapes: Some(known),
        ..Default::default()
    };
    let src = "import { Row } from './Row'; import { Other } from './Other'; export const A = (p) => <div><Row a={p.a} on={1} onClick={p.f} /><Other /></div>";
    let code = compile(src, &opts).code.expect("compiled");
    assert!(code.contains("Row$shape as Row$$v"), "{code}");
    assert!(
        !code.contains("Other$shape"),
        "only what exists is imported: {code}"
    );
}

#[test]
fn pending_shape_is_lowered_with_no_options() {
    let src = "import { Boundary } from '@kerf-js/core'; function Feed() { return <p>{1 + 1}</p> } export function P() { return <Boundary pending=\"shape\"><Feed /></Boundary> }";
    let (code, d) = run(src);
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("$$site0"), "{code}");
    assert!(!code.contains("\"shape\""), "{code}");
    assert!(code.contains("skeleton-scope"), "{code}");
}

#[test]
fn check_reports_exported_variants() {
    let src = "export function A() { return <p /> } export const B = () => <p />; function C() { return <p /> } export { C as D }; export default function E() { return <p /> } export function f() { return 1 }";
    let opts = Options {
        check_only: true,
        ..Default::default()
    };
    let mut names = compile(src, &opts).facts.shapes;
    names.sort();
    assert_eq!(names, ["A", "B", "D", "default"]);
}

#[test]
fn a_rewritten_name_as_a_tag_is_read_live() {
    let (row, d) = run(
        "const ns = {}; export const C = (p) => <ul>{p.xs.map(g => <li key={g.id}><g.icon class=\"x\" /><g.meta.icon /><ns.Icon /></li>)}</ul>;",
    );
    assert!(d.is_empty(), "{d:?}");
    assert!(
        row.contains("_$component(g().icon, { class: \"x\" })"),
        "{row}"
    );
    assert!(row.contains("_$component(g().meta.icon, {})"), "{row}");
    assert!(row.contains("_$component(ns.Icon, {})"), "{row}");
    assert!(!row.contains("_$tag"), "{row}");

    let (entries, _) = run(
        "export const C = (p) => <ul>{p.xs.map(({ id, ui, Icon }) => <li key={id}><ui.Icon /><Icon /></li>)}</ul>;",
    );
    assert!(
        entries.contains("_$component(_item().ui.Icon, {})"),
        "{entries}"
    );
    assert!(
        entries.contains("_$component(_item().Icon, {})"),
        "{entries}"
    );

    let (props, _) = run(
        "export function C({ ui, Icon = Dot, ...rest }) { return <p><ui.Icon /><Icon /><rest.Icon /></p>; }",
    );
    assert!(props.contains(".ui.Icon, {})"), "{props}");
    assert!(props.contains("=== undefined ? Dot :"), "{props}");
    assert!(
        !props.contains("_$component(ui.Icon")
            && !props.contains("_$component(Icon")
            && !props.contains("_$component(rest.Icon"),
        "{props}"
    );

    let dev = compile(
        "export const C = (p) => <ul>{p.xs.map(g => <li key={g.id}><g.icon /></li>)}</ul>;",
        &Options {
            filename: "App.tsx".into(),
            dev: true,
            ..Default::default()
        },
    );
    assert!(
        dev.code
            .unwrap()
            .contains("_$component(g().icon, {}, \"g.icon\", \"App.tsx:1\")")
    );
}

// ---- React prop names ------------------------------------------------------------------------------------------

#[test]
fn react_names_compile_to_attributes() {
    let (code, _) = run(
        r##"export const A = () => <svg tabIndex={0} viewBox="0 0 1 1" focusable={false}><path strokeWidth="2" clipPath="url(#a)" /><use xlinkHref="#a" /></svg>"##,
    );
    for out in [
        "tabindex=",
        "stroke-width=",
        "clip-path=",
        "xlink:href=",
        r#"focusable=\"false\""#,
    ] {
        assert!(code.contains(out), "{out}: {code}");
    }
    // negative controls: a case-sensitive attribute keeps its case, and the React spelling is gone
    assert!(code.contains("viewBox="), "{code}");
    assert!(
        !code.contains("strokeWidth") && !code.contains("tabIndex"),
        "{code}"
    );
}

#[test]
fn react_names_compile_for_the_server_and_dynamic_values() {
    let source =
        "export const A = (p) => <input tabIndex={p.i} defaultValue={p.v} defaultChecked={p.c} />";
    let ssr = compile(
        source,
        &Options {
            filename: "App.tsx".into(),
            generate: "ssr".into(),
            ..Default::default()
        },
    )
    .code
    .unwrap();
    for out in [r#"("tabindex", "#, r#"("value", "#, r#"("checked", "#] {
        assert!(ssr.contains(out), "{out}: {ssr}");
    }
    let (dom, _) = run(source);
    assert!(
        dom.contains(".defaultValue = ") && dom.contains(".defaultChecked = "),
        "{dom}"
    );
}

#[test]
fn react_events_compile_to_their_dom_events() {
    let (code, _) = run(
        "export const A = (p) => <input onDoubleClick={p.a} onClickCapture={p.b} onChange={p.c} onGotPointerCapture={p.d} />",
    );
    assert!(code.contains(r#""dblclick""#), "{code}");
    assert!(
        code.contains(r#".addEventListener("click", "#) && code.contains(", true);"),
        "{code}"
    );
    assert!(code.contains("_$change("), "{code}");
    assert!(code.contains(r#""gotpointercapture""#), "{code}");
}

#[test]
fn inner_html_and_form_values_compile_as_content() {
    let (code, _) = run(
        r#"export const A = (p) => <div><p dangerouslySetInnerHTML={p.raw} /><textarea value="a" /></div>"#,
    );
    assert!(code.contains("?.__html"), "{code}");
    assert!(!code.contains("dangerouslySetInnerHTML"), "{code}");
    assert!(
        code.contains(r#"_$bind(() => ("a")"#) && code.contains(".value = v"),
        "{code}"
    );
}

// ---- partial hydration: what says when an island can wait ----------------------------------------------------------

fn node(source: &str, name: &str) -> kerf_compiler::hydration::Node {
    let out = compile(
        source,
        &Options {
            filename: "App.tsx".into(),
            check_only: true,
            ..Default::default()
        },
    );
    out.facts
        .hydration
        .nodes
        .into_iter()
        .find(|n| n.name == name)
        .expect("node")
}

#[test]
fn facts_name_globals_outside_handlers_only() {
    let n = node(
        "export function A() { const x = window.matchMedia('(a)'); document.title = 'x'; return <button onClick={() => localStorage.clear()}>{x.matches}</button> }",
        "A",
    );
    assert!(
        n.globals.contains(&"matchMedia".to_string()),
        "{:?}",
        n.globals
    );
    assert!(
        n.globals.contains(&"document".to_string()),
        "{:?}",
        n.globals
    );
    assert!(
        !n.globals.contains(&"localStorage".to_string()),
        "a handler waits for its event: {:?}",
        n.globals
    );
}

#[test]
fn facts_name_what_cannot_wait() {
    assert!(
        node("export const A = () => <input autofocus />", "A")
            .early
            .unwrap()
            .contains("autofocus")
    );
    assert!(
        node("export const A = () => <div ref={el => el.focus()} />", "A")
            .early
            .unwrap()
            .contains("ref")
    );
    assert!(
        node(
            "export function A() { let e; return <div ref={el => { e = el }} /> }",
            "A"
        )
        .early
        .is_none()
    );
    assert!(
        node("export function A() { let e; const go = () => e.focus(); return <div ref={e} onClick={go} /> }", "A")
            .globals
            .contains(&".focus".to_string())
    );
}

#[test]
fn facts_tell_a_box_from_a_function_and_see_calls() {
    let src = "import { state } from '@kerf-js/core'\nimport { list } from './server/x'\nexport const cart = state(0)\nexport const A = () => <p onClick={() => list()}>{list().value}</p>\nexport const B = () => <p onClick={() => list()}>b</p>";
    assert!(node(src, "cart").value);
    assert!(!node(src, "A").value);
    assert_eq!(node(src, "A").calls, vec!["list"]);
    assert!(
        node(src, "B").calls.is_empty(),
        "a handler's calls wait for it"
    );
}

#[test]
fn the_visible_hatch_is_a_force() {
    assert_eq!(
        node(
            "/* @kerf visible */\nexport const A = () => <p onClick={() => 1} />",
            "A"
        )
        .force
        .as_deref(),
        Some("visible")
    );
}

#[test]
fn an_island_mark_carries_when_it_loads() {
    let opts = Options {
        filename: "App.tsx".into(),
        generate: "ssr".into(),
        hydratable: true,
        islands: Some(
            serde_json::from_str(
                r#"{"id":"a.tsx","sites":[{"index":0,"hoist":false,"when":"i"}]}"#,
            )
            .unwrap(),
        ),
        ..Default::default()
    };
    let code = compile(
        "import { C } from './c'\nexport const A = () => <C />",
        &opts,
    )
    .code
    .unwrap();
    assert!(code.contains(r#"void 0, "i")"#), "{code}");
}

#[test]
fn a_fragment_of_one_expression_can_follow_a_logical_operator() {
    let (code, d) = run(
        "export function A(p: any) { return <div>{p.c && <>{p.x}</>}{p.c || <>{p.y}</>}</div> }",
    );
    assert!(d.is_empty(), "{d:?}");
    assert!(code.contains("_c() && (() => (p.x))"), "{code}");
    assert!(code.contains("_c() || (() => (p.y))"), "{code}");
}

#[test]
fn a_list_nothing_can_rerun_is_a_plain_map() {
    for made in [
        "[1, 2]",
        "Array.from({ length: 2 }, (_, i) => i)",
        "new Array(2)",
    ] {
        let (code, d) = run(&format!(
            "const xs = {made}\nexport const A = () => <p>{{xs.map(x => <i>{{x}}</i>)}}</p>"
        ));
        assert!(!d.iter().any(|d| d.severity == Severity::Error), "{d:?}");
        assert!(!code.contains("For"), "{made}: {code}");
    }
}

#[test]
fn a_list_that_could_rerun_stays_a_list() {
    for source in [
        "let xs = [1]\nexport const A = () => <p>{xs.map(x => <i>{x}</i>)}</p>",
        "export const A = () => { const xs = [1]; return <p>{xs.map(x => <i>{x}</i>)}</p> }",
        "const xs = [1]\nexport const A = () => <p>{xs.map(x => <i key={x}>{x}</i>)}</p>",
        "const xs = make()\nexport const A = () => <p>{xs.map(x => <i>{x}</i>)}</p>",
    ] {
        let (code, _) = run(source);
        assert!(code.contains("For"), "{source}: {code}");
    }
}
