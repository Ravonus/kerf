// These snapshots refresh through a changing predicate; unrelated state writes do not help.

#[test]
fn w041_canonical_stream_and_cell_snapshots_refresh_through_their_predicates() {
    for source in [
        "import { state, untrack } from '@weft-js/core'; export function StreamChart(p) { \
         const paused = state(false); let held = untrack(() => p.data); \
         const flip = () => { held = p.data; paused.value = !paused.value }; \
         return <Chart data={paused.value ? held : p.data} paused={paused.value} \
         toolbar={<button onClick={flip}>{paused.value ? 'Resume' : 'Pause'}</button>} /> }",
        "import { state, untrack } from '@weft-js/core'; export function Cell(p) { \
         const c = untrack(() => p.col); const editing = state(false); const problem = state(''); \
         let seed = ''; const begin = () => { if (c.edit && !editing.value) { \
         seed = String(untrack(() => p.value) ?? ''); problem.value = ''; editing.value = true } }; \
         return <td onDblClick={begin} onKeyDown={() => begin()}>\
         {editing.value ? <Editor start={seed} /> : <Shown />}</td> }",
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
            "import { state as box } from '@weft-js/core'",
            "const gate = box(false)",
            "n = 1; gate.value = !gate.value",
            "gate.value ? n : 0",
        ),
        (
            "import * as core from '@weft-js/core'",
            "const gate = core.state(false); const alias = gate",
            "n = 1; alias.value = !alias.value",
            "gate.value ? n : 0",
        ),
        (
            "import { state } from '@weft-js/core'",
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
        "import {{ state }} from '@weft-js/core'; export function A() {{ \
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
        "import { state } from '@weft-js/core'; export function A() { const gate = state(false); let n = 0; \
         const safe = () => { n = 1; gate.value = !gate.value }; const stale = () => { n = 2 }; \
         return <div onClick={safe} onKeyDown={stale}>{gate.value ? n : 0}</div> }",
        "import { state } from '@weft-js/core'; export function A() { const gate = state(false); let n = 0; \
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
