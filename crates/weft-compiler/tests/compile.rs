include!("compile/props.rs");
include!("compile/lists.rs");
include!("compile/output.rs");
include!("compile/react.rs");
include!("compile/early_returns.rs");
include!("compile/handler_mutations.rs");
include!("compile/numeric_jsx.rs");
include!("compile/numeric_properties.rs");
include!("compile/async_callbacks.rs");
include!("compile/derived_writes.rs");
include!("compile/watch_cycles.rs");
include!("compile/watch_patterns.rs");
include!("compile/watch_copies.rs");
include!("compile/catalog_browser.rs");
include!("compile/runtime_imports.rs");

#[test]
fn default_route_shapes_include_lowercase_local_names() {
    for source in [
        "export default function page() { return <main>Page</main> }",
        "const page = () => <main>Page</main>; export default page",
        "const page = () => <main>Page</main>; export { page as default }",
    ] {
        let code = shaped(source);
        assert!(code.contains("function page$shape"), "{code}");
        assert!(code.contains("page$shape as default$shape"), "{code}");
    }
}

#[test]
fn lowercase_nondefault_helpers_do_not_gain_shapes() {
    let code = shaped("export const helper = () => <p>Helper</p>");
    assert!(!code.contains("function helper$shape"), "{code}");
}

#[test]
fn check_reports_default_route_shape_aliases() {
    for source in [
        "export default function page() { return <main /> }",
        "const layout = (props) => <main>{props.children}</main>; export default layout",
        "const page = () => <main />; export { page as default }",
    ] {
        let options = Options {
            check_only: true,
            ..Default::default()
        };
        let facts = compile(source, &options).facts;
        assert_eq!(facts.shapes, ["default"], "{source}");
    }
}

#[test]
fn standalone_shape_drops_module_and_setup_evaluation() {
    let source = r#"
        import { secret } from './server';
        const danger = sideEffect();
        export default function Page({ value = sideEffect() }) {
            const x = sideEffect();
            return <main class={danger} onClick={sideEffect}>{secret}{x}{value}</main>;
        }
    "#;
    let options = Options {
        filename: "page.tsx?weft-shape".into(),
        ..Default::default()
    };
    let code = compile(source, &options).code.expect("shape compiles");
    assert!(code.contains("default$shape"), "{code}");
    assert!(code.contains("skeleton"), "{code}");
    assert!(!code.contains("sideEffect"), "{code}");
    assert!(!code.contains("./server"), "{code}");
    assert!(!code.contains("danger"), "{code}");
}

#[test]
fn standalone_layout_places_only_the_direct_children_outlet() {
    for source in [
        r#"export default function Layout(props) {
            return <main><header>Before</header><section>{props.children}</section>
                <footer>After</footer>{props.secret.children}{other.children}{props.children()}</main>
        }"#,
        r#"export default function Layout({ children: outlet = unsafeDefault(), secret }) {
            return <main><header>Before</header><section>{outlet}</section>
                <footer>After</footer>{secret.children}{other.children}{unsafeCall()}</main>
        }"#,
    ] {
        let options = Options {
            filename: "layout.tsx?weft-shape".into(),
            generate: "ssr".into(),
            ..Default::default()
        };
        let code = compile(source, &options).code.expect("shape compiles");
        let before = code.find("Before").expect("header remains");
        let outlet = code.find("$$shapeProps.children").expect("outlet remains");
        let after = code.find("After").expect("footer remains");
        assert!(before < outlet && outlet < after, "{code}");
        assert_eq!(code.matches("$$shapeProps.children").count(), 1, "{code}");
        for unsafe_name in ["unsafeDefault", "unsafeCall", "secret", "other"] {
            assert!(!code.contains(unsafe_name), "{code}");
        }
    }
}

#[test]
fn standalone_nested_layouts_keep_each_outlet() {
    let source = r#"
        export function Inner({ children }) { return <article>{children}</article> }
        export default function Outer(props) { return <main><Inner>{props.children}</Inner></main> }
    "#;
    let options = Options {
        filename: "layout.tsx?weft-shape".into(),
        ..Default::default()
    };
    let code = compile(source, &options).code.expect("shape compiles");
    assert!(code.contains("Inner$shape"), "{code}");
    assert!(code.contains("default$shape"), "{code}");
    assert_eq!(code.matches("$$shapeProps.children").count(), 2, "{code}");
}
