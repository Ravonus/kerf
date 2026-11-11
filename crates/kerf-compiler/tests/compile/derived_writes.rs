// W002 requires a proven reactive box and a write executed by a derived callback.

fn derived_write_errors(diagnostics: &[Diagnostic]) -> Vec<&Diagnostic> {
    diagnostics.iter().filter(|d| d.code == "W002").collect()
}

fn derived_body(body: &str) -> String {
    format!(
        "import {{ state, derived }} from '@kerf/core'; const n = state(0); \
         derived(() => {{ {body} }});"
    )
}

#[test]
fn w002_state_write_is_an_error_with_pure_derived_advice_and_no_fix() {
    let (_, diagnostics) = run(&derived_body("n.value++; return n.value"));
    assert_eq!(codes(&diagnostics), ["W002"], "{diagnostics:?}");
    let error = &diagnostics[0];
    assert_eq!(error.severity, Severity::Error);
    assert!(error.message.contains("`n.value`") && error.message.contains("must be pure"));
    assert!(
        error.help.contains("event handler") && error.help.contains("return the computed value")
    );
    assert!(
        error.fix.is_none(),
        "moving a write can change when it runs"
    );
}

#[test]
fn w002_assignments_updates_destructuring_and_loop_targets_are_writes() {
    for body in [
        "n.value = 1; return 0",
        "n.value += 1; return 0",
        "n.value -= 1; return 0",
        "n.value *= 2; return 0",
        "n.value /= 2; return 0",
        "n.value %= 2; return 0",
        "n.value **= 2; return 0",
        "n.value &= 1; return 0",
        "n.value |= 1; return 0",
        "n.value ^= 1; return 0",
        "n.value <<= 1; return 0",
        "n.value >>= 1; return 0",
        "n.value >>>= 1; return 0",
        "n.value &&= 1; return 0",
        "n.value ||= 1; return 0",
        "n.value ??= 1; return 0",
        "return n.value++",
        "return ++n.value",
        "return n.value--",
        "return --n.value",
        "n['value'] = 1; return 0",
        "n['value']++; return 0",
        "[n.value] = [1]; return 0",
        "({ x: n.value } = { x: 1 }); return 0",
        "({ x: n.value = 1 } = {}); return 0",
        "for (n.value of items) {} return 0",
        "for (n.value in items) {} return 0",
        "if (flag) n.value++; return 0",
        "return flag ? ++n.value : 0",
    ] {
        let source = derived_body(body);
        let (_, diagnostics) = run(&source);
        assert_eq!(
            derived_write_errors(&diagnostics).len(),
            1,
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w002_core_import_callback_and_box_aliases_keep_provenance() {
    for source in [
        "import { state as s, derived as d } from '@kerf/core'; \
         const n = s(0); d(() => n.value++)",
        "import * as core from '@kerf/core'; const n = core.state(0); \
         core.derived(() => n.value++)",
        "import * as core from '@kerf/core'; const c = core; const n = c['state'](0); \
         c['derived'](() => n['value']++)",
        "import { state, derived } from '@kerf/core'; const s = state; const d = derived; \
         const n = s(0); const alias = n; d(() => alias.value++)",
        "import { state, derived } from '@kerf/core'; const n = state.linked(() => 0); \
         const first = n; const second = first; derived(() => second.value++)",
        "import { state, derived } from '@kerf/core'; const n = state(0); \
         const calculate = () => n.value++; derived(calculate)",
        "import { state, derived } from '@kerf/core'; const n = state(0); \
         const calculate = function () { return n.value++ }; \
         const alias = calculate; derived(alias)",
        "import { state, derived } from '@kerf/core'; const n = state(0); \
         derived(calculate); function calculate() { return n.value++ }",
        "import { state, derived } from '@kerf/core'; const n = state(0); \
         const calculate = () => n.value++; derived(calculate); derived(calculate)",
    ] {
        let (_, diagnostics) = run(source);
        assert_eq!(
            derived_write_errors(&diagnostics).len(),
            1,
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w002_shadows_ordinary_objects_and_unrelated_derived_calls_stay_quiet() {
    for source in [
        "import { derived } from '@kerf/core'; const n = { value: 0 }; \
         derived(() => n.value++)",
        "import { derived } from '@kerf/core'; const state = () => ({ value: 0 }); \
         const n = state(); derived(() => n.value++)",
        "import { state } from '@kerf/core'; import { derived } from 'other'; \
         const n = state(0); derived(() => n.value++)",
        "import { state } from '@kerf/core'; const derived = cb => cb(); \
         const n = state(0); derived(() => n.value++)",
        "import { state, derived } from '@kerf/core'; const n = state(0); \
         function f(derived) { derived(() => n.value++) }",
        "import * as core from '@kerf/core'; const n = core.state(0); \
         function f(core) { core.derived(() => n.value++) }",
        "import { state, derived } from '@kerf/core'; const n = state(0); \
         derived((n) => n.value++)",
        "import { state, derived } from '@kerf/core'; const n = state(0); \
         derived(() => { const n = { value: 0 }; return n.value++ })",
        "import { state, derived } from '@kerf/core'; const n = state(0); \
         const alias = { value: 0 }; derived(() => alias.value++)",
        "import { state, derived } from '@kerf/core'; const n = state(0); \
         derived(() => { let value = n.value; value++; return value })",
        "import { state, derived } from '@kerf/core'; const n = state(0); \
         derived(() => n.other++)",
    ] {
        let (_, diagnostics) = run(source);
        assert!(
            derived_write_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w002_deferred_handlers_and_non_derived_writes_stay_quiet() {
    for source in [
        "import { state, derived } from '@kerf/core'; const n = state(0); \
         n.value++; derived(() => n.value * 2)",
        "import { state, derived } from '@kerf/core'; const n = state(0); \
         derived(() => () => n.value++)",
        "import { state, derived } from '@kerf/core'; const n = state(0); \
         derived(() => { function click() { n.value++ } return click })",
        "import { state, derived } from '@kerf/core'; const n = state(0); \
         derived(() => <button onClick={() => n.value++} />)",
        "import { state, resource } from '@kerf/core'; const n = state(0); \
         resource(() => { n.value++; return 0 })",
        "import { state, derived } from '@kerf/core'; const n = state(0); \
         function unrelated() { n.value++ } derived(() => n.value)",
        "import { state, derived } from '@kerf/core'; import { callback as cb } from './cb'; \
         derived(cb)",
    ] {
        let (_, diagnostics) = run(source);
        assert!(
            derived_write_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
    for body in [
        "if (false) n.value++; return 0",
        "false && n.value++; return 0",
        "true || n.value++; return 0",
        "return 0; n.value++",
        "for (; false;) n.value++; return 0",
    ] {
        let source = derived_body(body);
        assert!(derived_write_errors(&run(&source).1).is_empty(), "{source}");
    }
}

#[test]
fn w002_and_w012_are_distinct_for_a_shared_callback() {
    let source = "import { state, derived, resource } from '@kerf/core'; const n = state(0); \
        const calculate = async () => { await wait(); n.value += 1; return 0 }; \
        derived(calculate); resource(calculate)";
    let (_, diagnostics) = run(source);
    assert_eq!(
        derived_write_errors(&diagnostics).len(),
        1,
        "{diagnostics:?}"
    );
    assert_eq!(
        async_callback_errors(&diagnostics).len(),
        2,
        "{diagnostics:?}"
    );
}

#[test]
fn w002_repaired_handler_and_pure_derived_compile_quietly() {
    for source in [
        "import { state, derived } from '@kerf/core'; export function A() { \
         const n = state(0); const doubled = derived(() => n.value * 2); \
         return <button onClick={() => n.value++}>{doubled.value}</button> }",
        "import { state, derived } from '@kerf/core'; const n = state(0); \
         const increment = () => { n.value++ }; const next = derived(() => n.value + 1)",
        "import { state, derived } from '@kerf/core'; const n = state(0); \
         derived(() => { let value = n.value; value += 1; return value })",
    ] {
        let (code, diagnostics) = run(source);
        assert!(diagnostics.is_empty(), "{source}: {diagnostics:?}");
        assert!(!code.is_empty(), "{source}");
    }
}
