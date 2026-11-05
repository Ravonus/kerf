// W004 proves the complete local getter/copy body and leaves effectful watches alone.

fn copy_watch_errors(diagnostics: &[Diagnostic]) -> Vec<&Diagnostic> {
    diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.code == "W004")
        .collect()
}

fn copy_watch_body(callback: &str) -> String {
    format!(
        "import {{ state, watch }} from '@weft-js/core'; \
         const source = state(0); const mirror = state(0); watch(() => source.value, {callback})"
    )
}

#[test]
fn w004_warns_with_actionable_derived_advice_and_no_unsafe_fix() {
    let source = copy_watch_body("value => { mirror.value = value }");
    let (code, diagnostics) = run(&source);
    assert_eq!(codes(&diagnostics), ["W004"], "{diagnostics:?}");
    assert!(!code.is_empty(), "a warning still produces code");
    let warning = &diagnostics[0];
    assert_eq!(warning.severity, Severity::Warning);
    assert!(warning.message.contains("only copies") && warning.message.contains("mirror.value"));
    assert!(
        warning.help.contains("derived(sourceGetter)") && warning.help.contains("first argument")
    );
    assert!(
        warning.help.contains("Remove this watch") && warning.help.contains("independent writes")
    );
    assert!(
        warning.fix.is_none(),
        "initialization and other writers need review"
    );
}

#[test]
fn w004_accepts_only_identity_copies_and_const_aliases() {
    for callback in [
        "value => mirror.value = value",
        "value => { mirror.value = value }",
        "function (value) { mirror.value = value }",
        "value => { return mirror.value = value }",
        "value => mirror['value'] = value",
        "value => { const alias = value; mirror.value = alias }",
        "value => { const alias = value; const again = alias; \
         const box = mirror; box['value'] = again }",
        "() => mirror.value = source.value",
        "() => { const value = source['value']; mirror.value = value }",
        "(value, previous) => mirror.value = value",
    ] {
        let source = copy_watch_body(callback);
        let (_, diagnostics) = run(&source);
        assert_eq!(
            copy_watch_errors(&diagnostics).len(),
            1,
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w004_resolves_import_namespaces_boxes_getters_and_callback_aliases() {
    for source in [
        "import { state as s, watch as w } from '@weft-js/core'; const a = s(0); \
         const b = s(0); w(() => a.value, value => b.value = value)",
        "import * as core from '@weft-js/core'; const a = core.state(0); \
         const b = core.state(0); core.watch(() => a.value, value => b.value = value)",
        "import * as core from '@weft-js/core'; const c = core; const s = c['state']; \
         const w = c['watch']; const a = s(0); const b = s(0); \
         w(() => a['value'], value => b['value'] = value)",
        "import { state, watch } from '@weft-js/core'; const a = state(0); \
         const b = state.linked(() => 0); watch(() => a.value, value => b.value = value)",
        "import { state, watch } from '@weft-js/core'; const a = state(0); \
         const b = state(0); const source = a; const target = b; \
         watch(() => source.value, value => target.value = value)",
        "import { state, watch } from '@weft-js/core'; const a = state(0); const b = state(0); \
         watch(read, copy); function read() { return a.value } \
         function copy(value) { b.value = value }",
        "import { state, watch } from '@weft-js/core'; const a = state(0); const b = state(0); \
         const read = () => a.value; const source = read; \
         const copy = function (value) { b.value = value }; const callback = copy; \
         watch(source, callback)",
        "import { state, watch } from '@weft-js/core'; const a = state(0); const b = state(0); \
         const read = () => { const box = a; const value = box.value; return value }; \
         watch(read, value => b.value = value)",
    ] {
        let (_, diagnostics) = run(source);
        assert_eq!(
            copy_watch_errors(&diagnostics).len(),
            1,
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w004_effects_transforms_conditions_and_deferred_work_stay_quiet() {
    for callback in [
        "value => { log(value); mirror.value = value }",
        "value => { mirror.value = value; log(value) }",
        "value => { const result = log(value); mirror.value = value }",
        "value => { mirror.value = value; source.value++ }",
        "value => (log(value), mirror.value = value)",
        "value => { if (flag) mirror.value = value }",
        "value => flag && (mirror.value = value)",
        "value => { if (!flag) return; mirror.value = value }",
        "value => mirror.value = value + 1",
        "value => mirror.value = +value",
        "value => mirror[key] = value",
        "value => mirror.other = value",
        "value => mirror.value = value.field",
        "value => getTarget().value = value",
        "value => mirror.value = { value }",
        "value => mirror.value = clone(value)",
        "value => mirror.value += value",
        "value => mirror.value ||= value",
        "(value, previous) => mirror.value = previous",
        "(value = log()) => mirror.value = value",
        "({ value }) => mirror.value = value",
        "(...values) => mirror.value = values[0]",
        "async value => mirror.value = value",
        "function* (value) { mirror.value = value }",
        "value => () => mirror.value = value",
        "value => { const later = () => mirror.value = value; return later }",
        "value => { setTimeout(() => mirror.value = value) }",
        "value => { const alias = value; alias++; mirror.value = alias }",
        "value => { for (const item of items) mirror.value = value }",
        "value => { try { mirror.value = value } finally { log() } }",
        "value => { using handle = value; mirror.value = value }",
    ] {
        let source = copy_watch_body(callback);
        let (_, diagnostics) = run(&source);
        assert!(
            copy_watch_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w004_unknown_shadows_ordinary_objects_and_unstable_bindings_stay_quiet() {
    for source in [
        "import { state } from '@weft-js/core'; import { watch } from 'other'; \
         const a = state(0); const b = state(0); watch(() => a.value, value => b.value = value)",
        "import { state } from '@weft-js/core'; const watch = (read, copy) => {}; \
         const a = state(0); const b = state(0); watch(() => a.value, value => b.value = value)",
        "import { state, watch } from '@weft-js/core'; const a = state(0); const b = state(0); \
         function run(watch) { watch(() => a.value, value => b.value = value) }",
        "import * as core from '@weft-js/core'; const a = core.state(0); const b = core.state(0); \
         function run(core) { core.watch(() => a.value, value => b.value = value) }",
        "import { state, watch } from '@weft-js/core'; const a = state(0); const b = { value: 0 }; \
         watch(() => a.value, value => b.value = value)",
        "import { state, watch } from '@weft-js/core'; const a = { value: 0 }; const b = state(0); \
         watch(() => a.value, value => b.value = value)",
        "import { watch } from '@weft-js/core'; const state = () => ({ value: 0 }); \
         const a = state(); const b = state(); watch(() => a.value, value => b.value = value)",
        "import { state, watch } from '@weft-js/core'; const a = state(0); const b = state(0); \
         watch(() => a.value, value => { const b = { value: 0 }; b.value = value })",
        "import { state, watch } from '@weft-js/core'; const a = state(0); const b = state(0); \
         let target = b; target = { value: 0 }; watch(() => a.value, value => target.value = value)",
        "import { state, watch } from '@weft-js/core'; const a = state(0); const b = state(0); \
         let copy = value => b.value = value; copy = value => log(value); watch(() => a.value, copy)",
        "import { state, watch } from '@weft-js/core'; import { read } from './read'; \
         const b = state(0); watch(read, value => b.value = value)",
        "import { state, watch } from '@weft-js/core'; const a = state(0); \
         const b = state(0); const c = state(0); watch(() => a.value, () => b.value = c.value)",
    ] {
        let (_, diagnostics) = run(source);
        assert!(
            copy_watch_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w004_requires_a_pure_getter_and_a_distinct_writable_state() {
    for source in [
        "import { state, watch } from '@weft-js/core'; const a = state(0); const b = state(0); \
         watch(() => { log(); return a.value }, value => b.value = value)",
        "import { state, watch } from '@weft-js/core'; const a = state(0); const b = state(0); \
         watch(() => { a.value; }, value => b.value = value)",
        "import { state, watch } from '@weft-js/core'; const a = state(0); const b = state(0); \
         watch(async () => a.value, value => b.value = value)",
        "import { state, watch } from '@weft-js/core'; const a = state(0); const b = state(0); \
         watch(() => a.value + 1, value => b.value = value)",
        "import { state, watch } from '@weft-js/core'; const a = state(0); const b = state(0); \
         const c = state(0); watch(() => a.value, value => { const extra = c.value; b.value = value })",
        "import { state, derived, watch } from '@weft-js/core'; const a = state(0); \
         const b = derived(() => 0); watch(() => a.value, value => b.value = value)",
        "import { state, resource, watch } from '@weft-js/core'; const a = state(0); \
         const b = resource(() => 0); watch(() => a.value, value => b.value = value)",
        "import { state, watch } from '@weft-js/core'; const a = state(0); \
         const alias = a; watch(() => a.value, value => alias.value = value)",
    ] {
        let (_, diagnostics) = run(source);
        assert!(
            copy_watch_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w004_checks_shared_callbacks_against_each_watch_source() {
    let source = "import { state, watch } from '@weft-js/core'; \
        const a = state(0); const b = state(0); const target = state(0); \
        const copy = value => target.value = value; \
        watch(() => a.value, copy); watch(() => b.value, copy)";
    assert_eq!(copy_watch_errors(&run(source).1).len(), 2);
    let source = "import { state, watch } from '@weft-js/core'; \
        const a = state(0); const b = state(0); const target = state(0); \
        const copy = () => target.value = a.value; \
        watch(() => a.value, copy); watch(() => b.value, copy)";
    assert_eq!(copy_watch_errors(&run(source).1).len(), 1);
}

#[test]
fn w004_repaired_derived_and_intentional_effects_compile_quietly() {
    for source in [
        "import { state, derived } from '@weft-js/core'; const source = state(0); \
         const mirror = derived(() => source.value)",
        "import { state, watch } from '@weft-js/core'; const source = state(0); \
         const mirror = state(0); watch(() => source.value, value => { \
         mirror.value = value; log(value) })",
    ] {
        let (code, diagnostics) = run(source);
        assert!(diagnostics.is_empty(), "{source}: {diagnostics:?}");
        assert!(!code.is_empty(), "{source}");
    }
}
