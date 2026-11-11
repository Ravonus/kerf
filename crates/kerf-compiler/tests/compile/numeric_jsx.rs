// W011 follows numeric evidence and only the values that can reach rendered output.

fn numeric_jsx_errors(diagnostics: &[Diagnostic]) -> Vec<&Diagnostic> {
    diagnostics.iter().filter(|d| d.code == "W011").collect()
}

#[test]
fn w011_numeric_guard_has_error_boolean_advice_and_a_safe_fix() {
    let source = "export function A({ items }) { return <div>{items.length && <p />}</div> }";
    let (_, diagnostics) = run(source);
    assert_eq!(codes(&diagnostics), ["W011"], "{diagnostics:?}");
    let error = &diagnostics[0];
    assert_eq!(error.severity, Severity::Error);
    assert!(error.message.contains("`items.length`") && error.message.contains("renders 0"));
    assert!(error.help.contains("!!(items.length)") && error.help.contains("items.length > 0"));
    assert!(error.fix.as_ref().unwrap().safe);
    let repaired = apply_fix(source, error);
    assert!(repaired.contains("!!(items.length) &&"), "{repaired}");
    assert!(run(&repaired).1.is_empty(), "{repaired}");
}

#[test]
fn w011_literals_lengths_and_numeric_assertions_are_evidence() {
    for guard in [
        "0",
        "1",
        "-1",
        "-0",
        "+read()",
        "items.length",
        "items['length']",
        "items?.length",
        "'text'.length",
        "[1].length",
        "({ length: 0 }).length",
        "unknown as number",
        "items.length - 1",
    ] {
        let source = format!(
            "export function A() {{ const items = []; \
             return <div>{{{guard} && <p />}}</div> }}"
        );
        let (_, diagnostics) = run(&source);
        assert_eq!(
            numeric_jsx_errors(&diagnostics).len(),
            1,
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w011_numeric_bindings_annotations_and_aliases_keep_symbol_identity() {
    for (setup, guard) in [
        ("const n = 0; const alias = n", "alias"),
        ("let n: number = 0", "n"),
        ("const n: number | undefined = 0", "n!"),
        (
            "const n: number | undefined = 0; const count = n ?? 0",
            "count",
        ),
        ("const n = -2; const twice = n * 2", "twice"),
        (
            "const model = { count: 0 }; const alias = model",
            "alias.count",
        ),
        ("const items = []; const { length: count } = items", "count"),
    ] {
        let source =
            format!("export function A() {{ {setup}; return <p>{{{guard} && <i />}}</p> }}");
        let (_, diagnostics) = run(&source);
        assert_eq!(
            numeric_jsx_errors(&diagnostics).len(),
            1,
            "{source}: {diagnostics:?}"
        );
    }
    for source in [
        "export function A({ count }: { count: number }) { return <p>{count && <i />}</p> }",
        "export function A(props: { count: number }) { return <p>{props.count && <i />}</p> }",
        "export function A({ count: n }: { count: number }) { return <p>{n && <i />}</p> }",
        "export function A({ meta }: { meta: { count: number } }) { \
         const alias = meta; return <p>{alias.count && <i />}</p> }",
        "import { state as box } from '@kerf/core'; export function A() { \
         const n = box(0); return <p>{n.value && <i />}</p> }",
        "import * as core from '@kerf/core'; export function A() { \
         const n = core.state(0); return <p>{n.value && <i />}</p> }",
        "import { derived } from '@kerf/core'; export function A() { \
         const n = derived(() => 0); return <p>{n.value && <i />}</p> }",
    ] {
        let (_, diagnostics) = run(source);
        assert_eq!(
            numeric_jsx_errors(&diagnostics).len(),
            1,
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w011_nested_rendered_values_and_callback_outputs_are_checked() {
    for (value, count) in [
        ("ok ? (n && <p />) : null", 1),
        ("true && (n && <p />)", 1),
        ("[n && <p />, 0 && <i />]", 2),
        ("n && (1 && <p />)", 2),
        ("(n && <p />) ?? null", 1),
        ("(n && <div>{0 && <p />}</div>) || null", 1),
        ("[1].map(() => n && <p />)", 1),
        ("[1].map(function () { return n && <p /> })", 1),
        (
            "[1].map(() => { if (ok) return n && <p />; return null })",
            1,
        ),
    ] {
        let source = format!(
            "export function A() {{ const n = 0; const ok = true; return <div>{{{value}}}</div> }}"
        );
        let (_, diagnostics) = run(&source);
        assert_eq!(
            numeric_jsx_errors(&diagnostics).len(),
            count,
            "{source}: {diagnostics:?}"
        );
    }
    for source in [
        "export function A() { const n = 0; return n && <p /> }",
        "const n = 0; export const A = () => n && <p />",
        "const n = 0; export const A = () => <Card children={n && <p />} />",
        "function helper() { return <div>{0 && <p />}</div> } \
         export function A() { return <div onClick={helper}>{helper()}</div> }",
    ] {
        let (_, diagnostics) = run(source);
        assert_eq!(
            numeric_jsx_errors(&diagnostics).len(),
            1,
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w011_boolean_comparison_and_unknown_guards_stay_quiet() {
    for guard in [
        "true",
        "false",
        "!!n",
        "n > 0",
        "n !== 0",
        "n === 0",
        "n < 0",
        "unknown",
        "unknown.count",
        "read()",
        "0n",
        "typeof n",
        "void n",
    ] {
        let source =
            format!("export function A() {{ const n = 0; return <p>{{{guard} && <i />}}</p> }}");
        let (_, diagnostics) = run(&source);
        assert!(
            numeric_jsx_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
    for value in [
        "(n && <p />) || null",
        "(n && true) === true ? <p /> : null",
        "!!(n && <p />)",
        "(n && log(), <p />)",
        "(n && <p />) ? <i /> : null",
    ] {
        let source =
            format!("export function A() {{ const n = 0; return <div>{{{value}}}</div> }}");
        let (_, diagnostics) = run(&source);
        assert!(
            numeric_jsx_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w011_shadowing_and_known_nonnumeric_lengths_override_spelling() {
    for source in [
        "const n = 0; export function A(n: boolean) { return <p>{n && <i />}</p> }",
        "const n = 0; export function A(n) { return <p>{n && <i />}</p> }",
        "export function A() { const n = false; const alias = n; return <p>{alias && <i />}</p> }",
        "export function A() { const model = { length: false }; return <p>{model.length && <i />}</p> }",
        "export function A() { const model = { length: 'ready' }; return <p>{model.length && <i />}</p> }",
        "export function A(props: { length: boolean }) { return <p>{props.length && <i />}</p> }",
        "export function A({ model }: { model: { length: boolean } }) { return <p>{model.length && <i />}</p> }",
        "export function A() { let n: any = 0; n = false; return <p>{n && <i />}</p> }",
        "const state = () => ({ value: false }); export function A() { const n = state(); \
         return <p>{n.value && <i />}</p> }",
    ] {
        let (_, diagnostics) = run(source);
        assert!(
            numeric_jsx_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w011_handler_effect_and_nonchildren_attribute_expressions_stay_quiet() {
    for source in [
        "export function A() { return <button onClick={() => 0 && log()} /> }",
        "export function A() { return <button onClick={() => <div>{0 && <p />}</div>} /> }",
        "const handle = () => <div>{0 && <p />}</div>; \
         export function A() { return <button onClick={handle} /> }",
        "function handle() { return <div>{0 && <p />}</div> } \
         export function A() { return <button onClick={handle} /> }",
        "export function A() { return <input disabled={0 && true} title={0 && 'label'} /> }",
        "export function A() { 0 && log(); const effect = () => 0 && log(); return <p /> }",
        "import { watch } from '@kerf/core'; export function A() { \
         watch(() => 0, () => <div>{0 && <p />}</div>); return <p /> }",
        "import { watch as effect } from '@kerf/core'; export function A() { \
         effect(() => 0, () => { 0 && log() }); return <p /> }",
        "import { onCleanup } from '@kerf/core'; export function A() { \
         onCleanup(() => <div>{0 && <p />}</div>); return <p /> }",
        "import { watch } from '@kerf/core'; const update = () => <div>{0 && <p />}</div>; \
         export function A() { watch(() => 0, update); return <p /> }",
    ] {
        let (_, diagnostics) = run(source);
        assert!(
            numeric_jsx_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w011_autofix_preserves_negative_truthiness_and_single_evaluation() {
    for (setup, guard) in [
        ("const n = -2", "n"),
        ("", "+next()"),
        ("const n = -0", "n"),
    ] {
        let source =
            format!("export function A() {{ {setup}; return <p>{{{guard} && <i />}}</p> }}");
        let (_, diagnostics) = run(&source);
        let errors = numeric_jsx_errors(&diagnostics);
        assert_eq!(errors.len(), 1, "{diagnostics:?}");
        let repaired = apply_fix(&source, errors[0]);
        assert!(repaired.contains(&format!("!!({guard})")), "{repaired}");
        assert!(
            !repaired.contains("> 0"),
            "negative guards must stay truthy: {repaired}"
        );
        assert_eq!(
            repaired.matches(guard).count(),
            source.matches(guard).count()
        );
        assert!(run(&repaired).1.is_empty(), "{repaired}");
    }
}

#[test]
fn w011_repaired_boolean_and_length_comparisons_compile_quietly() {
    for source in [
        "export function A({ items }) { return <p>{items.length > 0 && <i />}</p> }",
        "export function A() { const n = -2; return <p>{!!n && <i />}</p> }",
        "export function A() { const n = 0; return <p>{n > 0 ? <i /> : null}</p> }",
    ] {
        let (code, diagnostics) = run(source);
        assert!(diagnostics.is_empty(), "{source}: {diagnostics:?}");
        assert!(!code.is_empty(), "{source}");
    }
}
