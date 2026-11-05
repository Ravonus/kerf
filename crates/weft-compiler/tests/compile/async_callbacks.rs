// W012 checks known core callbacks; opaque imports and deferred closures stay opaque.

fn async_callback_errors(diagnostics: &[Diagnostic]) -> Vec<&Diagnostic> {
    diagnostics.iter().filter(|d| d.code == "W012").collect()
}

fn resource_body(body: &str) -> String {
    format!(
        "import {{ state, resource }} from '@weft-js/core'; const n = state(1); \
         resource(async () => {{ {body} }});"
    )
}

#[test]
fn w012_async_derived_is_an_error_with_resource_advice_and_no_fix() {
    let (_, diagnostics) = run("import { derived } from '@weft-js/core'; derived(async () => 1);");
    assert_eq!(codes(&diagnostics), ["W012"], "{diagnostics:?}");
    let error = &diagnostics[0];
    assert_eq!(error.severity, Severity::Error);
    assert!(error.message.contains("async `derived`") && error.message.contains("synchronous"));
    assert!(
        error.help.contains("resource(async") && error.help.contains("before the first `await`")
    );
    assert!(error.fix.is_none());
}

#[test]
fn w012_resolves_core_imports_namespaces_and_stable_callback_aliases() {
    for source in [
        "import { derived as d } from '@weft-js/core'; d(async () => 1)",
        "import * as core from '@weft-js/core'; core.derived(async () => 1)",
        "import * as core from '@weft-js/core'; core['derived'](async () => 1)",
        "import { derived } from '@weft-js/core'; const d = derived; d(async () => 1)",
        "import * as core from '@weft-js/core'; const c = core; c.derived(async () => 1)",
        "import { derived } from '@weft-js/core'; const cb = async () => 1; derived(cb)",
        "import { derived } from '@weft-js/core'; const cb = async () => 1; \
         const alias = cb; derived(alias)",
        "import { derived } from '@weft-js/core'; derived(cb); async function cb() { return 1 }",
        "import { resource as r, state as s } from '@weft-js/core'; const n = s(1); \
         const cb = async () => { await wait(); return n.value }; const alias = cb; r(alias)",
        "import * as core from '@weft-js/core'; const n = core.state(1); \
         core.resource(async () => { await wait(); return n.value })",
        "import { resource, state } from '@weft-js/core'; const n = state.linked(() => 1); \
         const alias = n; resource(async () => { await wait(); return alias.value })",
    ] {
        let (_, diagnostics) = run(source);
        assert_eq!(
            async_callback_errors(&diagnostics).len(),
            1,
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w012_resource_read_has_error_capture_advice_and_no_order_changing_fix() {
    let source = resource_body("await wait(); return n.value");
    let (_, diagnostics) = run(&source);
    assert_eq!(codes(&diagnostics), ["W012"], "{diagnostics:?}");
    let error = &diagnostics[0];
    assert_eq!(error.severity, Severity::Error);
    assert!(error.message.contains("`n.value`") && error.message.contains("no longer tracked"));
    assert!(error.help.contains("before the first `await`") && error.help.contains("local values"));
    assert!(error.fix.is_none());
}

#[test]
fn w012_reports_only_reads_evaluated_after_suspension() {
    for body in [
        "await wait(); return n.value",
        "return (await wait()) + n.value",
        "await wait(); return n['value']",
        "return n.get(await key())",
        "await wait(); const { value } = n; return value",
        "await wait(); n.value += 1; return 0",
        "await wait(); n.value++; return 0",
        "await wait(); n.value.field = 1; return 0",
    ] {
        let source = resource_body(body);
        let (_, diagnostics) = run(&source);
        assert_eq!(
            async_callback_errors(&diagnostics).len(),
            1,
            "{source}: {diagnostics:?}"
        );
    }
    for body in [
        "return await n.value",
        "return n.value + await wait()",
        "await fetch(n.value); return 1",
        "const value = n.value; await wait(); return value",
        "const { value } = n; await wait(); return value",
        "await wait(); n.value = 1; return 0",
        "await wait(); ({ value: n.value } = { value: 1 }); return 0",
        "await wait(); delete n.value; return 0",
        "n.value += await wait(); return 0",
        "await wait(); return n",
        "const plain = { value: 1 }; await wait(); return plain.value",
    ] {
        let source = resource_body(body);
        let (_, diagnostics) = run(&source);
        assert!(
            async_callback_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w012_reuses_component_props_live_aliases_and_rest_facts() {
    for source in [
        "import { resource } from '@weft-js/core'; export function A({ id }) { \
         resource(async () => { await wait(); return id }); return <p /> }",
        "import { resource } from '@weft-js/core'; export const A = props => { \
         resource(async () => { await wait(); return props.id }); return <p /> }",
        "import { resource } from '@weft-js/core'; export function A(props) { \
         const id = props.id; resource(async () => { await wait(); return id }); return <p /> }",
        "import { resource } from '@weft-js/core'; export function A(props) { \
         const alias = props; resource(async () => { await wait(); return alias.id }); return <p /> }",
        "import { resource } from '@weft-js/core'; export function A({ id, ...rest }) { \
         resource(async () => { await wait(); return rest.name }); return <p /> }",
        "import { resource } from '@weft-js/core'; export function A(props) { \
         resource(async () => { await wait(); const { id } = props; return id }); return <p /> }",
    ] {
        let (_, diagnostics) = run(source);
        assert_eq!(
            async_callback_errors(&diagnostics).len(),
            1,
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w012_tracks_awaits_through_branches_loops_and_exception_paths() {
    for body in [
        "if (flag) await wait(); return n.value",
        "flag ? await wait() : 0; return n.value",
        "flag && await wait(); return n.value",
        "flag || await wait(); return n.value",
        "flag ?? await wait(); return n.value",
        "while (flag) { read(n.value); await wait() } return 0",
        "do { read(n.value); await wait() } while (flag); return 0",
        "for (; flag; await wait()) read(n.value); return 0",
        "for (const item of items) { read(n.value); await wait() } return 0",
        "for (const item in items) { read(n.value); await wait() } return 0",
        "for await (const item of items) return n.value; return 0",
        "for await (const item of items) {} return n.value",
        "while (flag) { await wait(); break } return n.value",
        "while (flag) { read(n.value); await wait(); continue } return 0",
        "outer: while (flag) { await wait(); break outer } return n.value",
        "switch (flag) { case 0: await wait(); break } return n.value",
        "switch (flag) { default: return n.value; case await wait(): return 0 }",
        "try { await wait() } catch {} return n.value",
        "try { await wait() } catch { return n.value } return 0",
        "try { await wait(); return 0 } finally { read(n.value) }",
        "while (true) { try { break } finally { await wait() } } return n.value",
    ] {
        let source = resource_body(body);
        let (_, diagnostics) = run(&source);
        assert_eq!(
            async_callback_errors(&diagnostics).len(),
            1,
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w012_dead_awaits_and_returned_paths_do_not_taint_continuations() {
    for body in [
        "if (false) await wait(); return n.value",
        "true || await wait(); return n.value",
        "false && await wait(); return n.value",
        "false ?? await wait(); return n.value",
        "if (flag) { await wait(); return 0 } return n.value",
        "if (flag) { await wait(); throw 0 } return n.value",
        "while (flag) { await wait(); return 0 } return n.value",
        "while (false) { await wait() } return n.value",
        "do { break; await wait() } while (flag); return n.value",
        "for (; false;) await wait(); return n.value",
        "for (const item of items) { await wait(); return 0 } return n.value",
        "switch (flag) { case 0: await wait(); return 0 } return n.value",
        "try { await wait(); return 0 } catch { return 0 } return n.value",
        "try { if (flag) { await wait(); return 0 } } finally {} return n.value",
        "while (flag) { if (other) break; try { await wait(); return 0 } finally {} } \
         return n.value",
        "while (flag) { try { await wait(); break } finally { return 0 } } return n.value",
        "return n.value; await wait()",
    ] {
        let source = resource_body(body);
        let (_, diagnostics) = run(&source);
        assert!(
            async_callback_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w012_unrelated_functions_shadows_and_deferred_callbacks_stay_quiet() {
    for source in [
        "function derived(callback) { return callback } derived(async () => 1)",
        "import { derived } from 'other'; derived(async () => 1)",
        "import { derived } from '@weft-js/core'; function f(derived) { derived(async () => 1) }",
        "import * as core from '@weft-js/core'; function f(core) { core.derived(async () => 1) }",
        "import { resource } from '@weft-js/core'; const state = () => ({ value: 1 }); \
         const n = state(); resource(async () => { await wait(); return n.value })",
        "import { resource, state } from '@weft-js/core'; const n = state(1); \
         resource(async (n) => { await wait(); return n.value })",
        "import { resource } from '@weft-js/core'; \
         const Result = resource(async signal => { await wait(); return signal.aborted })",
        "import { resource, state } from '@weft-js/core'; const n = state(1); \
         function handler() { return async () => { await wait(); return n.value } }",
        "import { resource, state } from '@weft-js/core'; const n = state(1); \
         resource(async () => { const later = async () => { await wait(); return n.value }; \
         return n.value })",
        "import { resource, state } from '@weft-js/core'; const n = state(1); \
         resource(async () => { await wait(); return () => n.value })",
        "import { derived, resource } from '@weft-js/core'; import { callback as cb } from './cb'; \
         derived(cb); resource(cb)",
        "import { derived } from '@weft-js/core'; let cb = async () => 1; cb = () => 1; derived(cb)",
    ] {
        let (_, diagnostics) = run(source);
        assert!(
            async_callback_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w012_repairs_compile_quietly_and_keep_emitting_code() {
    for source in [
        "import { derived, state } from '@weft-js/core'; const n = state(1); \
         const result = derived(() => n.value + 1)",
        "import { resource } from '@weft-js/core'; const result = resource(async () => await load())",
        "import { resource, state } from '@weft-js/core'; const n = state(1); \
         resource(async () => { const value = n.value; await wait(); return value })",
        "import { resource } from '@weft-js/core'; export function A(props) { \
         resource(async () => { const id = props.id; await wait(); return id }); return <p /> }",
        "import { resource } from '@weft-js/core'; export function A({ id }) { \
         resource(async () => { const snapshot = id; await wait(); return snapshot }); return <p /> }",
    ] {
        let (code, diagnostics) = run(source);
        assert!(diagnostics.is_empty(), "{source}: {diagnostics:?}");
        assert!(!code.is_empty(), "{source}");
    }
}
