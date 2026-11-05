// W003 proves cycles between resolved local source/callback functions and box aliases.

fn watch_cycle_errors(diagnostics: &[Diagnostic]) -> Vec<&Diagnostic> {
    diagnostics.iter().filter(|d| d.code == "W003").collect()
}

fn watch_body(source: &str, body: &str) -> String {
    format!(
        "import {{ state, watch }} from '@weft-js/core'; const n = state(0); \
         const other = state(0); watch(() => {source}, () => {{ {body} }});"
    )
}

#[test]
fn w003_is_an_error_with_derived_and_pure_source_advice_without_a_fix() {
    let source = watch_body("n.value", "n.value++");
    let (_, diagnostics) = run(&source);
    assert_eq!(codes(&diagnostics), ["W003"], "{diagnostics:?}");
    let error = &diagnostics[0];
    assert_eq!(error.severity, Severity::Error);
    assert!(error.message.contains("n.value") && error.message.contains("own source"));
    assert!(error.help.contains("derived(() =>") && error.help.contains("source pure"));
    assert!(
        error.fix.is_none(),
        "changing a watch can change when it runs"
    );
}

#[test]
fn w003_assignments_updates_patterns_and_loop_targets_write_the_source() {
    for body in [
        "n.value = 1",
        "n.value += 1",
        "n.value -= 1",
        "n.value *= 2",
        "n.value /= 2",
        "n.value %= 2",
        "n.value **= 2",
        "n.value &= 1",
        "n.value |= 1",
        "n.value ^= 1",
        "n.value <<= 1",
        "n.value >>= 1",
        "n.value >>>= 1",
        "n.value &&= 1",
        "n.value ||= 1",
        "n.value ??= 1",
        "++n.value",
        "n.value--",
        "n['value'] = 1",
        "n['value']++",
        "[n.value] = [1]",
        "({ x: n.value } = { x: 1 })",
        "({ x: n['value'] = 1 } = {})",
        "for (n.value of items) {}",
        "for (n['value'] in items) {}",
        "if (flag) n.value++",
        "flag ? n.value++ : 0",
    ] {
        let source = watch_body("n.value", body);
        let (_, diagnostics) = run(&source);
        assert_eq!(
            watch_cycle_errors(&diagnostics).len(),
            1,
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w003_resolves_import_namespace_callback_and_box_aliases() {
    for source in [
        "import { state as s, watch as w } from '@weft-js/core'; \
         const n = s(0); w(() => n.value, () => n.value++)",
        "import * as core from '@weft-js/core'; const c = core; const n = c['state'](0); \
         c['watch'](() => n['value'], () => n['value']++)",
        "import { state, watch } from '@weft-js/core'; const s = state; const w = watch; \
         const n = s(0); const alias = n; w(() => alias.value, () => n.value++)",
        "import { state, watch } from '@weft-js/core'; const n = state.linked(() => 0); \
         const a = n; const b = a; watch(() => n.value, () => b.value++)",
        "import { state, watch } from '@weft-js/core'; const n = state(0); \
         const read = () => n.value; const write = function () { n.value++ }; \
         const source = read; const callback = write; watch(source, callback)",
        "import { state, watch } from '@weft-js/core'; const n = state(0); \
         watch(read, write); function read() { return n.value } function write() { n.value++ }",
        "import { state, watch } from '@weft-js/core'; const n = state(0); \
         watch(() => { const alias = n; return alias.value }, () => n.value++)",
        "import { state, watch } from '@weft-js/core'; const n = state(0); \
         watch(() => n.value, () => { const alias = n; alias.value++ })",
    ] {
        let (_, diagnostics) = run(source);
        assert_eq!(
            watch_cycle_errors(&diagnostics).len(),
            1,
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w003_matches_each_watch_and_each_box_instead_of_all_callback_reads() {
    for (source, body, count) in [
        ("n.value + other.value", "n.value++; other.value++", 2),
        ("n.value", "other.value++", 0),
        ("other.value", "n.value++", 0),
        ("n.value", "n.other = 1", 0),
        ("n.value", "consume(n.value)", 0),
        ("n.other", "n.value++", 0),
        ("n[key]", "n.value++", 0),
        ("n.value", "n[key] = 1", 0),
        ("n.value", "consume(other.value); n.value++", 1),
        ("n.value", "consume(n.value); other.value++", 0),
        ("n['value']", "n.value++", 1),
        ("n.get('field')", "n.value = {}", 1),
        ("n.value.field", "n.value = {}", 1),
        ("({ value: n.value })", "n.value++", 1),
    ] {
        let source = watch_body(source, body);
        let (_, diagnostics) = run(&source);
        assert_eq!(
            watch_cycle_errors(&diagnostics).len(),
            count,
            "{source}: {diagnostics:?}"
        );
    }
    let source = "import { state, watch } from '@weft-js/core'; \
        const n = state(0); const m = state(0); const write = () => n.value++; \
        watch(() => m.value, write); watch(() => n.value, () => m.value++)";
    assert!(watch_cycle_errors(&run(source).1).is_empty());
    let source = format!("{source}; watch(() => n.value, write); watch(() => n.value, write)");
    assert_eq!(watch_cycle_errors(&run(&source).1).len(), 1);
}

#[test]
fn w003_source_destructuring_and_control_flow_keep_dependencies() {
    for source in [
        "() => { const { value } = n; return value }",
        "() => { if (n.value) return 1; return 0 }",
        "() => flag ? n.value : other.value",
        "() => { consume(n.value); return 0 }",
    ] {
        let source = format!(
            "import {{ state, watch }} from '@weft-js/core'; \
             const n = state(0); const other = state(0); watch({source}, () => n.value++)"
        );
        assert_eq!(watch_cycle_errors(&run(&source).1).len(), 1, "{source}");
    }
}

#[test]
fn w003_shadowed_unrelated_and_ordinary_value_objects_stay_quiet() {
    for source in [
        "import { state } from '@weft-js/core'; import { watch } from 'other'; \
         const n = state(0); watch(() => n.value, () => n.value++)",
        "import { state } from '@weft-js/core'; const watch = (s, cb) => cb(); \
         const n = state(0); watch(() => n.value, () => n.value++)",
        "import { state, watch } from '@weft-js/core'; const n = state(0); \
         function f(watch) { watch(() => n.value, () => n.value++) }",
        "import * as core from '@weft-js/core'; const n = core.state(0); \
         function f(core) { core.watch(() => n.value, () => n.value++) }",
        "import { watch } from '@weft-js/core'; const n = { value: 0 }; \
         watch(() => n.value, () => n.value++)",
        "import { watch } from '@weft-js/core'; const state = () => ({ value: 0 }); \
         const n = state(); watch(() => n.value, () => n.value++)",
        "import { state, watch } from '@weft-js/core'; const n = state(0); \
         watch(n => n.value, () => n.value++)",
        "import { state, watch } from '@weft-js/core'; const n = state(0); \
         watch(() => n.value, n => n.value++)",
        "import { state, watch } from '@weft-js/core'; const n = state(0); \
         watch(() => n.value, () => { const n = { value: 0 }; n.value++ })",
    ] {
        let (_, diagnostics) = run(source);
        assert!(
            watch_cycle_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w003_deferred_callbacks_and_unreachable_accesses_stay_quiet() {
    for body in [
        "return () => n.value++",
        "function later() { n.value++ }",
        "queueMicrotask(() => n.value++)",
        "setTimeout(function () { n.value++ })",
        "return <button onClick={() => n.value++} />",
        "return; n.value++",
        "if (false) n.value++",
        "false && n.value++",
        "true || n.value++",
        "for (; false;) n.value++",
    ] {
        let source = watch_body("n.value", body);
        assert!(watch_cycle_errors(&run(&source).1).is_empty(), "{source}");
    }
    for source in [
        "() => () => n.value",
        "() => { function later() { return n.value } return 0 }",
        "() => { return 0; consume(n.value) }",
        "() => false && n.value",
        "() => { if (false) return n.value; return 0 }",
    ] {
        let source = format!(
            "import {{ state, watch }} from '@weft-js/core'; \
             const n = state(0); watch({source}, () => n.value++)"
        );
        assert!(watch_cycle_errors(&run(&source).1).is_empty(), "{source}");
    }
}

#[test]
fn w003_async_sources_only_track_reads_before_suspension() {
    for (read, write, count) in [
        (
            "() => n.value",
            "async () => { await wait(); n.value++ }",
            1,
        ),
        (
            "async () => { const value = n.value; await wait(); return value }",
            "() => n.value++",
            1,
        ),
        (
            "async () => { await wait(); return n.value }",
            "() => n.value++",
            0,
        ),
    ] {
        let source = format!(
            "import {{ state, watch }} from '@weft-js/core'; \
             const n = state(0); watch({read}, {write})"
        );
        assert_eq!(watch_cycle_errors(&run(&source).1).len(), count, "{source}");
    }
}

#[test]
fn w003_opaque_and_unstable_identities_stay_outside_local_inference() {
    for source in [
        "import { state, watch } from '@weft-js/core'; import { read } from './read'; \
         const n = state(0); watch(read, () => n.value++)",
        "import { state, watch } from '@weft-js/core'; import { write } from './write'; \
         const n = state(0); watch(() => n.value, write)",
        "import { state, watch } from '@weft-js/core'; const n = state(0); \
         const read = () => n.value; watch(() => read(), () => n.value++)",
        "import { state, watch } from '@weft-js/core'; const n = state(0); \
         let read = () => n.value; read = () => 0; watch(read, () => n.value++)",
        "import { state, watch } from '@weft-js/core'; const n = state(0); \
         let write = () => n.value++; write = () => {}; watch(() => n.value, write)",
        "import { state, watch } from '@weft-js/core'; let n = state(0); \
         n = { value: 0 }; watch(() => n.value, () => n.value++)",
    ] {
        assert!(watch_cycle_errors(&run(source).1).is_empty(), "{source}");
    }
}

#[test]
fn w003_repaired_derived_and_independent_watch_compile_quietly() {
    for source in [
        "import { state, derived } from '@weft-js/core'; const n = state(0); \
         const next = derived(() => n.value + 1)",
        "import { state, watch } from '@weft-js/core'; const n = state(0); \
         const result = state(0); watch(() => n.value, value => { result.value = value + 1 })",
        "import { state, watch } from '@weft-js/core'; const n = state(0); \
         watch(() => n.value, value => { consume(value) }); const increment = () => n.value++",
    ] {
        let (code, diagnostics) = run(source);
        assert!(diagnostics.is_empty(), "{source}: {diagnostics:?}");
        assert!(!code.is_empty(), "{source}");
    }
}
