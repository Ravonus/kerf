// These snapshots refresh through a changing predicate; unrelated state writes do not help.

#[test]
fn w041_native_event_stream_and_cell_snapshots_refresh_through_predicates() {
    for source in [
        "import { state, untrack } from '@kerf/core'; export function StreamChart(p) { \
         const paused = state(false); let held = untrack(() => p.data); \
         const flip = () => { held = p.data; paused.value = !paused.value }; \
         return <Chart data={paused.value ? held : p.data} paused={paused.value} \
         toolbar={<button onClick={flip}>{paused.value ? 'Resume' : 'Pause'}</button>} /> }",
        "import { state, untrack } from '@kerf/core'; export function Cell(p) { \
         const c = untrack(() => p.col); const editing = state(false); const problem = state(''); \
         let seed = ''; const begin = () => { if (c.edit && !editing.value) { \
         seed = String(untrack(() => p.value) ?? ''); problem.value = ''; editing.value = true } }; \
         const done = () => { problem.value = ''; editing.value = false }; \
         return <td onDblClick={begin} onKeyDown={(c.edit ? () => begin() : undefined)!}>\
         {editing.value ? <Editor start={seed} onDone={done} /> : <Shown />}</td> }",
    ] {
        let (code, diagnostics) = run(source);
        assert!(diagnostics.is_empty(), "{source}: {diagnostics:?}");
        assert!(!code.is_empty(), "{source}");
        if source.contains("StreamChart") {
            assert!(
                code.contains("get data()") && code.contains("paused.value ? held"),
                "{code}"
            );
        } else {
            assert!(
                code.contains("memo(() => editing.value)") && code.contains("start: seed"),
                "{code}"
            );
        }
    }
}

#[test]
fn w041_refresh_proof_uses_symbols_and_guaranteed_predicate_changes() {
    for (imports, setup, handler, output) in [
        (
            "import { state as box } from '@kerf/core'",
            "const gate = box(false)",
            "n = 1; gate.value = !gate.value",
            "gate.value ? n : 0",
        ),
        (
            "import * as core from '@kerf/core'",
            "const gate = core.state(false); const alias = gate",
            "n = 1; alias.value = !alias.value",
            "gate.value ? n : 0",
        ),
        (
            "import { state } from '@kerf/core'",
            "const gate = state(true)",
            "if (gate.value) { n = 1; gate.value = false }",
            "gate.value ? 0 : n",
        ),
    ] {
        let source = format!(
            "{imports}; export function A() {{ let n = 0; {setup}; \
            return <button onClick={{() => {{ {handler} }}}}>{{{output}}}</button> }}"
        );
        let (_, diagnostics) = run(&source);
        assert!(
            handler_mutation_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w041_local_reads_still_fail_without_a_matching_refresh_guarantee() {
    for (setup, handler, output) in [
        ("", "n = 1; gate.value = true", "gate.value ? n : 0"),
        ("", "n = 1; gate.value = !gate.value", "n"),
        (
            "const other = state(false)",
            "n = 1; other.value = !other.value",
            "gate.value ? n : 0",
        ),
        (
            "",
            "n = 1; if (flag) gate.value = !gate.value",
            "gate.value ? n : 0",
        ),
        ("", "gate.value = !gate.value; n = 1", "gate.value ? n : 0"),
        (
            "",
            "n = 1; return; gate.value = !gate.value",
            "gate.value ? n : 0",
        ),
        (
            "",
            "n = 1; risky(); gate.value = !gate.value",
            "gate.value ? n : 0",
        ),
        (
            "",
            "n = 1; gate.value = !gate.value; risky()",
            "gate.value ? n : 0",
        ),
        (
            "",
            "n = 1; gate.value = !gate.value; gate.value = !gate.value",
            "gate.value ? n : 0",
        ),
        (
            "const alias = gate",
            "alias.value = true; n = 1; gate.value = true",
            "gate.value ? n : 0",
        ),
    ] {
        assert_handler_stale(setup, handler, output);
    }
}

#[test]
fn w041_unguarded_reads_and_uncertain_tails_keep_state_advice() {
    for (setup, handler, output) in [
        (
            "",
            "n = 1; gate.value = !gate.value",
            "<>{gate.value ? n : 0}{n}</>",
        ),
        (
            "",
            "n = 1; gate.value = !gate.value",
            "<>{gate.value ? n : 0}{n++}</>",
        ),
        (
            "const label = () => n",
            "n = 1; gate.value = !gate.value",
            "<>{gate.value ? n : 0}{label()}</>",
        ),
        (
            "",
            "n = 1; gate.value = !gate.value",
            "gate.value > 0 ? n : 0",
        ),
        (
            "",
            "if (!gate.value) { n = 1; gate.value = true } risky()",
            "gate.value ? 0 : n",
        ),
    ] {
        assert_handler_stale(setup, handler, output);
    }
}

fn assert_handler_stale(setup: &str, handler: &str, output: &str) {
    let source = format!(
        "import {{ state }} from '@kerf/core'; export function A() {{ \
        const gate = state(false); let n = 0; {setup}; \
        return <button onClick={{() => {{ {handler} }}}}>{{{output}}}</button> }}"
    );
    let (_, diagnostics) = run(&source);
    let errors = handler_mutation_errors(&diagnostics);
    assert_eq!(errors.len(), 1, "{source}: {diagnostics:?}");
    assert_eq!(errors[0].severity, Severity::Error);
    assert!(errors[0].help.contains("n.value") && errors[0].fix.is_none());
}

#[test]
fn w041_ordinary_objects_and_partially_refreshed_handlers_remain_errors() {
    for source in [
        "export function A() { const gate = { value: false }; let n = 0; \
         return <button onClick={() => { n = 1; gate.value = !gate.value }}>{gate.value ? n : 0}</button> }",
        "const state = () => ({ value: false }); export function A() { const gate = state(); let n = 0; \
         return <button onClick={() => { n = 1; gate.value = !gate.value }}>{gate.value ? n : 0}</button> }",
        "import { state } from '@kerf/core'; export function A() { const gate = state(false); let n = 0; \
         const safe = () => { n = 1; gate.value = !gate.value }; const stale = () => { n = 2 }; \
         return <div onClick={safe} onKeyDown={stale}>{gate.value ? n : 0}</div> }",
        "import { state } from '@kerf/core'; export function A() { const gate = state(false); let n = 0; \
         const stale = gate => { n = 1; gate.value = !gate.value }; \
         return <button onClick={stale}>{gate.value ? n : 0}</button> }",
    ] {
        let (_, diagnostics) = run(source);
        assert_eq!(
            handler_mutation_errors(&diagnostics).len(),
            1,
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w041_condition_and_rhs_mutators_invalidate_entry_truthiness() {
    for (setup, handler) in [
        (
            "function mutate() { gate.value = true; return 1 }",
            "if (!gate.value && mutate()) { n = 1; gate.value = true }",
        ),
        (
            "function mutate() { gate.value = true; return 1 }",
            "if (!gate.value) { n = mutate(); gate.value = true }",
        ),
        (
            "const alias = gate; const mutate = () => { alias['value'] = true; return 1 }; const call = mutate",
            "if (!alias['value'] && call()) { n = 1; gate.value = true }",
        ),
        (
            "const alias = gate; const mutate = () => { alias.value = true; return 1 }; const call = mutate",
            "if (!gate.value) { n = call(); alias.value = true }",
        ),
        (
            "const model = { get read() { gate.value = true; return 1 } }",
            "if (!gate.value && model.read) { n = 1; gate.value = true }",
        ),
        (
            "const alias = gate; const model = { get read() { alias.value = true; return 1 } }",
            "if (!gate.value) { n = model.read; gate.value = true }",
        ),
        (
            "const model = { valueOf() { gate.value = true; return 1 } }",
            "if (!gate.value) { n = +model; gate.value = true }",
        ),
        (
            "function mutate() { ({ value: gate.value } = { value: true }); return 1 }",
            "if (!gate.value) { n = mutate(); gate.value = true }",
        ),
        (
            "const alias = gate; function mutate() { [alias.value] = [true]; return 1 }",
            "if (!gate.value) { n = mutate(); gate.value = true }",
        ),
    ] {
        assert_handler_stale(setup, handler, "gate.value ? n : 0");
    }
}

#[test]
fn w041_unknown_code_cannot_rely_on_an_escaped_gate_fact() {
    for (setup, handler) in [
        (
            "",
            "if (!gate.value && external(gate)) { n = 1; gate.value = true }",
        ),
        (
            "const alias = gate",
            "if (!gate.value) { n = external(alias); gate.value = true }",
        ),
        (
            "const holder = { box: gate }",
            "if (!gate.value) { n = external(holder); gate.value = true }",
        ),
        (
            "const publish = () => gate; external(publish)",
            "if (!gate.value) { n = external(); gate.value = true }",
        ),
    ] {
        assert_handler_stale(setup, handler, "gate.value ? n : 0");
    }
    assert_handler_stale(
        "function mutate() { gate.value = true; return 1 }",
        "n = mutate(); gate.value = !gate.value",
        "gate.value ? 0 : n",
    );
}

#[test]
fn w041_late_and_recursive_mutators_do_not_prove_a_refresh() {
    for source in [
        "import { state } from '@kerf/core'; export function A() { \
         const gate = state(false); let n = 0; \
         const click = () => { if (!gate.value) { n = mutate(); gate.value = true } }; \
         return <button onClick={click}>{gate.value ? n : 0}</button>; \
         function mutate() { gate.value = true; return 1 } }",
        "import { state } from '@kerf/core'; export function A() { \
         const gate = state(false); let n = 0; let entered = false; \
         function mutate() { if (!entered) { entered = true; click() } return 1 } \
         const click = () => { if (!gate.value) { n = mutate(); gate.value = true } }; \
         return <button onClick={click}>{gate.value ? n : 0}</button> }",
    ] {
        let (_, diagnostics) = run(source);
        let errors = handler_mutation_errors(&diagnostics);
        assert_eq!(errors.len(), 1, "{source}: {diagnostics:?}");
        assert!(errors[0].message.starts_with("`n`"));
    }
}

#[test]
fn w041_external_callback_reentry_keeps_the_original_writer_stale() {
    for (setup, gate, callback) in [
        ("", "gate", "begin"),
        ("", "gate", "begin!"),
        ("const alias = begin; const again = alias", "gate", "again"),
        ("const box = gate; const alias = begin", "box", "alias"),
        ("", "gate", "() => begin()"),
        ("", "gate", "function callback() { return begin() }"),
        ("function wrapper() { return begin() }", "gate", "wrapper"),
        ("const wrapper = () => begin", "gate", "wrapper()"),
        ("const callbacks = { run: begin }", "gate", "callbacks.run"),
        ("const callbacks = [begin]", "gate", "callbacks[0]"),
        ("", "gate", "begin.bind(null)"),
        (
            "let alias = begin; alias = flag ? begin : alias",
            "gate",
            "alias",
        ),
    ] {
        let source = format!(
            "import {{ state }} from '@kerf/core'; import {{ external }} from './external'; \
             export function A() {{ const gate = state(false); let n = 0; {setup}; \
             function begin() {{ if (!{gate}.value) {{ n = external({callback}); {gate}.value = true }} }} \
             return <button onClick={{begin}}>{{gate.value ? n : 0}}</button> }}"
        );
        let (_, diagnostics) = run(&source);
        let errors = handler_mutation_errors(&diagnostics);
        assert_eq!(errors.len(), 1, "{source}: {diagnostics:?}");
        assert!(errors[0].message.starts_with("`n`"));
        assert_eq!(errors[0].severity, Severity::Error);
        assert!(errors[0].help.contains("n.value") && errors[0].fix.is_none());
    }
}

#[test]
fn w041_direct_event_callback_aliases_keep_the_refresh_control_quiet() {
    for callback in [
        "begin",
        "alias",
        "() => alias()",
        "alias!",
        "alias as () => void",
        "(flag ? () => alias() : undefined)!",
    ] {
        let source = format!(
            "import {{ state }} from '@kerf/core'; export function A() {{ \
             const gate = state(false); let n = 0; const begin = () => {{ \
             if (!gate.value) {{ n = 1; gate.value = true }} }}; const alias = begin; \
             return <button onClick={{{callback}}}>{{gate.value ? n : 0}}</button> }}"
        );
        let (code, diagnostics) = run(&source);
        assert!(diagnostics.is_empty(), "{source}: {diagnostics:?}");
        assert!(!code.is_empty(), "{source}");
    }
}

#[test]
fn w041_opaque_components_can_capture_event_shaped_callback_props() {
    for (imports, setup, view) in [
        (
            "import { Capture, external } from './external'",
            "",
            "<Capture onClick={begin} />",
        ),
        (
            "import { Capture as Consumer, external } from './external'",
            "const alias = begin; const again = alias",
            "<Consumer onClick={again} />",
        ),
        (
            "import * as UI from './external'; import { external } from './external'",
            "const callback = () => begin()",
            "<UI.Capture onClick={callback} />",
        ),
        (
            "import { Capture, external } from './external'",
            "const View = Capture; const alias = begin",
            "<View onClick={alias!} />",
        ),
        (
            "import { Capture, external } from './external'",
            "",
            "<div data-slot={<Capture onClick={begin} />} />",
        ),
        (
            "import { Button } from './Button'; import { external } from './external'",
            "",
            "<Button onClick={begin} />",
        ),
    ] {
        let source = format!(
            "import {{ state }} from '@kerf/core'; {imports}; export function A() {{ \
             const gate = state(false); let n = 0; {setup}; function begin() {{ \
             if (!gate.value) {{ n = external(); gate.value = true }} }} \
             return <>{view}<button onClick={{begin}}>{{gate.value ? n : 0}}</button></> }}"
        );
        let (_, diagnostics) = run(&source);
        let errors = handler_mutation_errors(&diagnostics);
        assert_eq!(errors.len(), 1, "{source}: {diagnostics:?}");
        assert!(errors[0].message.starts_with("`n`"));
        assert_eq!(errors[0].severity, Severity::Error);
        assert!(errors[0].help.contains("n.value") && errors[0].fix.is_none());
    }
}
