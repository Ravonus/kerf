// W041 requires the same local binding to reach a handler write and a rendered read.

fn handler_mutation_errors(diagnostics: &[Diagnostic]) -> Vec<&Diagnostic> {
    diagnostics.iter().filter(|d| d.code == "W041").collect()
}

#[test]
fn w041_handler_mutation_is_an_error_with_state_migration_advice() {
    let source = "export function A() { let n = 0; \
        return <button onClick={() => n++}>{n}</button> }";
    let (_, diagnostics) = run(source);
    assert_eq!(codes(&diagnostics), ["W041"], "{diagnostics:?}");
    let error = &diagnostics[0];
    assert_eq!(error.severity, Severity::Error);
    assert!(error.message.contains("`n`") && error.message.contains("never updates"));
    assert!(error.help.contains("const n = state(initial)"));
    assert!(error.help.contains("@weft-js/core") && error.help.contains("n.value"));
    assert!(
        error.fix.is_none(),
        "state migration changes every read and write"
    );
}

#[test]
fn w041_updates_assignments_and_destructuring_writes_use_symbol_flags() {
    for mutation in [
        "n++",
        "++n",
        "n--",
        "--n",
        "n = 1",
        "n += 1",
        "n -= 1",
        "n *= 2",
        "n &&= 1",
        "n ||= 1",
        "n ??= 1",
        "[n] = [1]",
        "({ n } = { n: 1 })",
        "({ value: n } = { value: 1 })",
    ] {
        let source = format!(
            "export function A() {{ let n = 0; \
             return <button onClick={() => {{ {mutation} }}}>{{n}}</button> }}"
        );
        let (_, diagnostics) = run(&source);
        assert_eq!(
            handler_mutation_errors(&diagnostics).len(),
            1,
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w041_handlers_can_be_named_aliased_wrapped_or_conditional() {
    for (setup, handler) in [
        ("const inc = () => n++", "inc"),
        ("function inc() { n++ }", "inc"),
        ("const inc = function () { n = 1 }", "inc"),
        (
            "const inc = () => n++; const click = inc; const alias = click",
            "alias",
        ),
        (
            "function update() { n++ } function inc() { update() }",
            "inc",
        ),
        ("const inc = () => n++", "() => inc()"),
        ("const inc = () => n++", "true ? inc : () => {}"),
        ("", "() => [1].forEach(() => n++)"),
        ("", "() => (() => n++)()"),
    ] {
        let source = format!(
            "export function A() {{ let n = 0; {setup}; \
             return <button onClick={{{handler}}}>{{n}}</button> }}"
        );
        let (_, diagnostics) = run(&source);
        assert_eq!(
            handler_mutation_errors(&diagnostics).len(),
            1,
            "{source}: {diagnostics:?}"
        );
    }
    let (_, diagnostics) = run("export function A() { let n = 0; \
        return <button onClick={inc}>{n}</button>; function inc() { n++ } }");
    assert_eq!(
        handler_mutation_errors(&diagnostics).len(),
        1,
        "{diagnostics:?}"
    );
}

#[test]
fn w041_rendered_reads_include_attributes_helpers_and_jsx_callbacks() {
    for (setup, jsx) in [
        ("", "<input value={n} onInput={() => n++} />"),
        ("", "<Card value={n} onChange={() => n++} />"),
        ("", "<button title={`${n}`} onClick={() => n++} />"),
        (
            "const label = () => n",
            "<button onClick={() => n++}>{label()}</button>",
        ),
        (
            "function label() { return n }",
            "<button onClick={() => n++}>{label()}</button>",
        ),
        (
            "",
            "<div onClick={() => n++}>{[1].map(x => <p key={x}>{n}</p>)}</div>",
        ),
        (
            "function Inner() { return <p>{n}</p> }",
            "<div onClick={() => n++}><Inner /></div>",
        ),
    ] {
        let source = format!("export function A() {{ let n = 0; {setup}; return {jsx} }}");
        let (_, diagnostics) = run(&source);
        assert_eq!(
            handler_mutation_errors(&diagnostics).len(),
            1,
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w041_shadowed_bindings_and_setup_only_mutations_stay_quiet() {
    let sources = [
        "export function A() { let n = 0; return <button onClick={n => n++}>{n}</button> }",
        "export function A() { let n = 0; const inc = () => { let n = 1; n++ }; \
         return <button onClick={inc}>{n}</button> }",
        "export function A() { let n = 0; n++; return <p>{n}</p> }",
        "export function A() { let n = 0; const inc = () => n++; inc(); \
         return <button onClick={() => {}}>{n}</button> }",
        "export function A() { let n = 0; const unused = () => n++; \
         return <button onClick={() => {}}>{n}</button> }",
        "export function A() { let n = 0; const ignore = callback => {}; \
         return <button onClick={() => ignore(() => n++)}>{n}</button> }",
        "export function A() { let n = 0; const api = { map: callback => {} }; \
         return <button onClick={() => api.map(() => n++)}>{n}</button> }",
        "export function A() { let n = 0; const inc = () => n++; \
         return <button onClick={() => inc}>{n}</button> }",
        "export function A() { let n = 0; let inc = () => n++; inc = () => {}; \
         return <button onClick={inc}>{n}</button> }",
        "let n = 0; export function A() { return <button onClick={() => n++}>{n}</button> }",
        "function ordinary() { let n = 0; return <button onClick={() => n++}>{n}</button> }",
    ];
    for source in sources {
        let (_, diagnostics) = run(source);
        assert!(
            handler_mutation_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w041_values_read_only_by_handlers_or_unused_functions_are_not_rendered() {
    let sources = [
        "export function A() { let n = 0; \
         return <button onClick={() => { n++; console.log(n) }} /> }",
        "export function A() { let n = 0; const inc = () => ++n; \
         return <button onClick={inc} /> }",
        "export function A() { let n = 0; const unused = () => <p>{n}</p>; \
         return <button onClick={() => n++} /> }",
        "export function A() { let n = 0; \
         const unused = () => <button onClick={() => n++} />; return <p>{n}</p> }",
        "export function A() { let n = 0; \
         return <Card calculate={() => n} onClick={() => n++} /> }",
        "export function A() { let n = 0; function label() { console.log(n); return 1 } \
         return <button onClick={() => n++}>{label()}</button> }",
        "export function A() { let n = 0; \
         return <button onClick={() => { const later = () => n++ }}>{n}</button> }",
        "export function A() { let n = 0; \
         return <button onClick={() => n++}>{[1].forEach(() => n)}</button> }",
        "export function A() { let element; \
         return <button ref={element} onClick={() => { element = undefined }} /> }",
    ];
    for source in sources {
        let (_, diagnostics) = run(source);
        assert!(
            handler_mutation_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w041_real_boxes_and_live_prop_aliases_keep_their_output() {
    let sources = [
        "import { state } from '@weft-js/core'; export function A() { let n = state(0); \
         return <button onClick={() => n.value++}>{n.value}</button> }",
        "export function A({ n }) { let local = n; \
         return <button onClick={() => local++}>{local}</button> }",
    ];
    for source in sources {
        let (code, diagnostics) = run(source);
        assert!(
            handler_mutation_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
        assert!(!code.is_empty(), "{source}");
    }
}

#[test]
fn w041_refused_prop_aliases_keep_the_existing_w001_advice() {
    let (_, diagnostics) = run("export function A(props) { let n = props.user.name; \
         return <button onClick={() => { n = 2 }}>{n}</button> }");
    assert_eq!(codes(&diagnostics), ["W001"], "{diagnostics:?}");
    assert!(diagnostics[0].help.contains("state.linked"));
}

#[test]
fn w041_reports_each_rendered_binding_once() {
    let source = "export function A() { let n = 0; let other = 0; \
        return <button onClick={() => { n++; n += 2; other = 1 }}>{n + other}</button> }";
    let (_, diagnostics) = run(source);
    let errors = handler_mutation_errors(&diagnostics);
    assert_eq!(errors.len(), 2, "{diagnostics:?}");
    assert!(errors[0].message.starts_with("`n`"));
    assert!(errors[1].message.starts_with("`other`"));
}

#[test]
fn w041_state_repairs_compile_without_diagnostics() {
    for setup in [
        "const inc = () => n.value++",
        "function inc() { n.value = n.value + 1 }",
        "const inc = () => n.value++; const click = inc",
    ] {
        let handler = if setup.contains("const click") {
            "click"
        } else {
            "inc"
        };
        let source = format!(
            "import {{ state }} from '@weft-js/core'; export function A() {{ \
             const n = state(0); {setup}; return <button onClick={{{handler}}}>{{n.value}}</button> }}"
        );
        let (code, diagnostics) = run(&source);
        assert!(diagnostics.is_empty(), "{source}: {diagnostics:?}");
        assert!(
            code.contains("state(0)") && code.contains("n.value"),
            "{code}"
        );
    }
}
