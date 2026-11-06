// W040 describes the setup branch; other diagnostics may also name its setup-time reads.

fn early_return_errors(diagnostics: &[Diagnostic]) -> Vec<&Diagnostic> {
    diagnostics.iter().filter(|d| d.code == "W040").collect()
}

#[test]
fn w040_reactive_setup_returns_are_errors_with_jsx_advice() {
    let source = "import { state } from '@weft-js/core'; \
        export function A() { const gate = state(false); \
        if (gate.value) return null; return <p /> }";
    let (_, diagnostics) = run(source);
    let errors = early_return_errors(&diagnostics);
    assert_eq!(errors.len(), 1, "{diagnostics:?}");
    let error = errors[0];
    assert_eq!(error.code, "W040");
    assert_eq!(error.severity, Severity::Error);
    assert!(error.message.contains("`gate.value`"), "{error:?}");
    assert!(error.message.contains("runs once") && error.message.contains("never rechecks"));
    assert!(error.help.contains("Branch in JSX") && error.help.contains("return <>"));
    assert!(error.fix.is_none(), "moving setup code needs review");
}

#[test]
fn w040_props_and_stable_aliases_control_early_returns() {
    let sources = [
        "export function A({ hidden }) { if (hidden) return null; return <p /> }",
        "export function A(props) { if (props['hidden']) return; return <p /> }",
        "export function A(props) { const hidden = props.hidden; \
         const alias = hidden; if (alias) return null; return <p /> }",
        "export function A(props) { const other = props; const { hidden } = other; \
         if (hidden) return null; return <p /> }",
        "export function A({ hidden: flag = false }) { if (flag) return null; return <p /> }",
        "import { state } from '@weft-js/core'; export const A = () => { \
         const gate = state(0); const value = gate.value; const hidden = value > 0; \
         if (hidden) return null; return <p /> }",
        "import { state } from '@weft-js/core'; export function A() { \
         const gate = state(false); const alias = gate; \
         if (alias.value) return null; return <p /> }",
        "import { state } from '@weft-js/core'; export function A() { \
         const gate = state(false); const { value: hidden } = gate; \
         if (hidden) return null; return <p /> }",
        "import { derived } from '@weft-js/core'; export function A({ hidden }) { \
         const gate = derived(() => hidden); if (gate.value) return null; return <p /> }",
        "import { state } from '@weft-js/core'; export function A() { \
         const gate = state({ hidden: true }); \
         if (gate.get('hidden')) return null; return <p /> }",
    ];
    for source in sources {
        let (_, diagnostics) = run(source);
        assert_eq!(
            early_return_errors(&diagnostics).len(),
            1,
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w040_nested_branches_keep_the_reactive_controlling_condition() {
    for branch in [
        "if (gate.value) { if (true) { return null } }",
        "if (true) { if (gate.value) return null }",
        "if (gate.value) {} else { return null }",
        "if (gate.value) { try { return null } finally {} }",
        "if (false) {} else if (gate.value) { return null }",
    ] {
        let source = format!(
            "import {{ state }} from '@weft-js/core'; \
             export function A() {{ const gate = state(false); {branch}; return <p /> }}"
        );
        let (_, diagnostics) = run(&source);
        let errors = early_return_errors(&diagnostics);
        assert_eq!(errors.len(), 1, "{source}: {diagnostics:?}");
        assert!(errors[0].message.contains("`gate.value`"));
    }
}

#[test]
fn w040_switch_and_loop_tests_can_control_setup_returns() {
    for branch in [
        "switch (gate.value.length) { case 0: return null; default: break }",
        "switch (0) { case gate.value.length: return null; default: break }",
        "while (gate.value.length > 0) { return null }",
        "for (; gate.value.length > 0;) { return null }",
        "for (const item of gate.value) { return null }",
        "for (const index in gate.value) { return null }",
    ] {
        let source = format!(
            "import {{ state }} from '@weft-js/core'; \
             export function A() {{ const gate = state([1]); {branch}; return <p /> }}"
        );
        let (_, diagnostics) = run(&source);
        assert_eq!(
            early_return_errors(&diagnostics).len(),
            1,
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w040_spread_collections_keep_dependencies_in_value_contexts() {
    for (initial, branch) in [
        ("[]", "for (const item of [...gate.value]) { return null }"),
        ("{}", "for (const key in { ...gate.value }) { return null }"),
        (
            "[]",
            "for (const item of new Set(gate.value)) { return null }",
        ),
        (
            "{}",
            "for (const key in new Object(gate.value)) { return null }",
        ),
        (
            "[]",
            "const items = [...gate.value]; for (const item of items) { return null }",
        ),
        (
            "{}",
            "const copy = { ...gate.value }; const alias = copy; \
          for (const key in alias) { return null }",
        ),
        (
            "[]",
            "switch ([...gate.value].length) { case 0: return null; default: break }",
        ),
        (
            "{}",
            "switch (0) { case Object.keys({ ...gate.value }).length: \
          return null; default: break }",
        ),
        (
            "[]",
            "const items = [...gate.value]; \
          switch (items.length) { case 0: return null; default: break }",
        ),
    ] {
        let source = format!(
            "import {{ state }} from '@weft-js/core'; \
             export function A() {{ const gate = state({initial}); {branch}; return <p /> }}"
        );
        let (_, diagnostics) = run(&source);
        let errors = early_return_errors(&diagnostics);
        assert_eq!(errors.len(), 1, "{source}: {diagnostics:?}");
        assert_eq!(errors[0].severity, Severity::Error);
        assert!(errors[0].help.contains("Branch in JSX"));
        assert!(errors[0].fix.is_none());
    }
}

#[test]
fn w040_new_objects_keep_identity_dependencies_in_switch_tests() {
    for branch in [
        "const expected = {}; switch (new Object(gate.value)) { \
         case expected: return null; default: break }",
        "const expected = {}; switch (expected) { \
         case new Object(gate.value): return null; default: break }",
        "const expected = {}; const copy = new Object(gate.value); switch (copy) { \
         case expected: return null; default: break }",
    ] {
        let source = format!(
            "import {{ state }} from '@weft-js/core'; \
             export function A() {{ const gate = state({{}}); {branch}; return <p /> }}"
        );
        let (_, diagnostics) = run(&source);
        assert_eq!(
            early_return_errors(&diagnostics).len(),
            1,
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w040_allocated_objects_and_aliases_have_static_boolean_identity() {
    for (initial, branch) in [
        ("[]", "if ([...gate.value]) return null"),
        ("{}", "if ({ ...gate.value }) return null"),
        ("[]", "if (new Set(gate.value)) return null"),
        (
            "[]",
            "const items = [...gate.value]; if (items) return null",
        ),
        (
            "{}",
            "const copy = { ...gate.value }; const alias = copy; if (alias) return null",
        ),
        (
            "[]",
            "const items = [...gate.value]; if (!items) return null",
        ),
        ("{}", "if (!{ ...gate.value }) return null"),
        ("[]", "while ([...gate.value]) { return null }"),
        (
            "[]",
            "const items = [...gate.value]; while (items) { return null }",
        ),
        ("{}", "for (; { ...gate.value };) { return null }"),
        (
            "{}",
            "const copy = { ...gate.value }; for (; copy;) { return null }",
        ),
        ("[]", "for (const item of []) { return null }"),
        ("{}", "for (const key in {}) { return null }"),
    ] {
        let source = format!(
            "import {{ state }} from '@weft-js/core'; \
             export function A() {{ const gate = state({initial}); {branch}; return <p /> }}"
        );
        let (_, diagnostics) = run(&source);
        assert!(
            early_return_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w040_spread_collection_repairs_branch_in_jsx_without_diagnostics() {
    for (initial, condition) in [
        ("[]", "[...gate.value].length === 0"),
        ("{}", "Object.keys({ ...gate.value }).length === 0"),
    ] {
        let source = format!(
            "import {{ state }} from '@weft-js/core'; export function A() {{ \
             const gate = state({initial}); return <>{{{condition} ? <p /> : null}}</> }}"
        );
        let (code, diagnostics) = run(&source);
        assert!(diagnostics.is_empty(), "{source}: {diagnostics:?}");
        assert!(!code.is_empty(), "{source}");
    }
}

#[test]
fn w040_handlers_callbacks_and_ordinary_functions_stay_quiet() {
    let sources = [
        "import { state } from '@weft-js/core'; const gate = state(false); \
         function ordinary() { if (gate.value) return null; return 1 }",
        "import { state } from '@weft-js/core'; export function A() { const gate = state(false); \
         const handler = () => { if (gate.value) return; return 1 }; \
         return <button onClick={handler} /> }",
        "import { state } from '@weft-js/core'; export function A() { const gate = state(false); \
         return <button onClick={() => { if (gate.value) return; doWork() }} /> }",
        "import { state, derived } from '@weft-js/core'; \
         export function A() { const gate = state(false); \
         const value = derived(() => { if (gate.value) return 1; return 0 }); \
         return <p>{value.value}</p> }",
        "import { state, watch } from '@weft-js/core'; \
         export function A() { const gate = state(false); \
         watch(() => gate.value, value => { if (value) return; doWork() }); return <p /> }",
        "import { state } from '@weft-js/core'; export function A() { const gate = state(false); \
         [1].forEach(() => { if (gate.value) return; doWork() }); return <p /> }",
    ];
    for source in sources {
        let (_, diagnostics) = run(source);
        assert!(
            early_return_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w040_static_branches_box_identity_and_branches_without_returns_stay_quiet() {
    for branch in [
        "if (false) return null",
        "const hidden = false; const alias = hidden; if (alias) return null",
        "const config = { value: false }; if (config.value) return null",
        "if (gate) return null",
        "const alias = gate; if (alias) return null",
        "const config = { value: gate.value }; if (config) return null",
        "if ([gate.value]) return null",
        "const snapshot = untrack(() => gate.value); if (snapshot) return null",
        "if (gate.value) { doWork() }",
        "if (gate.value) { const handler = () => { return null } }",
        "const alias = gate; { const alias = { value: false }; if (alias.value) return null }",
        "let hidden = gate.value; hidden = false; if (hidden) return null",
        "do { return null } while (gate.value)",
    ] {
        let source = format!(
            "import {{ state, untrack }} from '@weft-js/core'; \
             export function A() {{ const gate = state(false); {branch}; return <p /> }}"
        );
        let (_, diagnostics) = run(&source);
        assert!(
            early_return_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w040_final_jsx_conditional_returns_are_not_setup_guards() {
    for body in [
        "return gate.value ? <p /> : null",
        "return gate.value && <p />",
        "return <>{gate.value ? <p /> : null}</>",
    ] {
        let source = format!(
            "import {{ state }} from '@weft-js/core'; \
             export function A() {{ const gate = state(false); {body} }}"
        );
        let (_, diagnostics) = run(&source);
        assert!(
            early_return_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
    let (_, diagnostics) = run("export const A = ({ hidden }) => hidden ? null : <p />");
    assert!(
        early_return_errors(&diagnostics).is_empty(),
        "{diagnostics:?}"
    );
}

#[test]
fn w040_repaired_jsx_branches_compile_without_diagnostics() {
    let sources = [
        "export function A({ hidden }) { return <>{hidden ? null : <p />}</> }",
        "import { state } from '@weft-js/core'; export function A() { \
         const gate = state(false); return <>{gate.value ? null : <p />}</> }",
        "import { state, derived } from '@weft-js/core'; export function A() { \
         const gate = state(false); const hidden = derived(() => gate.value); \
         return <>{hidden.value ? null : <p />}</> }",
    ];
    for source in sources {
        let (code, diagnostics) = run(source);
        assert!(diagnostics.is_empty(), "{source}: {diagnostics:?}");
        assert!(!code.is_empty(), "{source}");
    }
}
