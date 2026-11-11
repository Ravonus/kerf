// Destructuring assignment invokes a source getter between reference and default evaluation.

#[test]
fn w003_assignment_patterns_read_the_same_box_but_not_an_independent_box() {
    for (body, count) in [
        ("let v; ({ value: v } = n); return v", 1),
        ("let v; ({ value: v } = other); return v", 0),
        (
            "const alias = n; let v; ({ value: v } = alias); return v",
            1,
        ),
        (
            "const alias = other; let v; ({ value: v } = alias); return v",
            0,
        ),
        ("let value; ({ value } = n); return value", 1),
        ("let value; ({ value } = other); return value", 0),
        ("let v; ({ ['value']: v } = n); return v", 1),
        ("let v; ({ ['other']: v } = n); return v", 0),
        ("let v; ({ [key]: v } = n); return v", 0),
        ("let v; ({ value: v } = { value: 0 }); return v", 0),
        ("let v; ({ value: v } = n); return 0", 1),
    ] {
        let source = watch_body(&format!("{{ {body} }}"), "n.value++");
        let (_, diagnostics) = run(&source);
        assert_eq!(
            watch_cycle_errors(&diagnostics).len(),
            count,
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w003_nested_patterns_and_defaults_keep_local_box_identity() {
    for (body, count) in [
        ("let v; ({ value: { field: v } } = n); return v", 1),
        ("let v; ({ value: { field: v } } = other); return v", 0),
        ("let v; ({ value: [v] } = n); return v", 1),
        ("let v; ({ value: [v] } = other); return v", 0),
        ("let v; ({ value: v = 0 } = n); return v", 1),
        ("let value; ({ value = 0 } = n); return value", 1),
        ("let v; ({ item: { value: v } = n } = {}); return v", 1),
        ("let v; ({ item: { value: v } = other } = {}); return v", 0),
        ("let v; [{ value: v } = n] = []; return v", 1),
        ("let v; [{ value: v } = other] = []; return v", 0),
        (
            "const alias = n; let v; [{ value: v } = alias] = []; return v",
            1,
        ),
    ] {
        let source = watch_body(&format!("{{ {body} }}"), "n.value++");
        let (_, diagnostics) = run(&source);
        assert_eq!(
            watch_cycle_errors(&diagnostics).len(),
            count,
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w003_assignment_getters_follow_rhs_keys_and_target_references_before_defaults() {
    for (body, count) in [
        ("let v; ({ value: v = await load() } = n); return v", 1),
        ("let value; ({ value = await load() } = n); return value", 1),
        (
            "let v; ({ value: { field: v } = await load() } = n); return v",
            1,
        ),
        ("let v; ({ value: [v] = await load() } = n); return v", 1),
        (
            "const target = {}; ({ value: target.field } = n); return 0",
            1,
        ),
        (
            "const target = {}; ({ value: target[await key()] } = n); return 0",
            0,
        ),
        (
            "const target = {}; ({ value: target[await key()] = 0 } = n); return 0",
            0,
        ),
        ("let v; ({ [await key()]: v, value: v } = n); return v", 0),
        ("let v; ({ value: { [await key()]: v } } = n); return v", 1),
        ("let v; ({ value: v } = (await load(), n)); return v", 0),
        ("let v; await load(); ({ value: v } = n); return v", 0),
        (
            "let v; ({ item: { value: v } = n } = await load()); return v",
            0,
        ),
        ("let v; [{ value: v } = n] = await load(); return v", 0),
        ("let v; ({ [n.value]: v } = await load()); return v", 0),
        ("let v; ({ [n.value]: v } = {}); await load(); return v", 1),
    ] {
        let source = format!(
            "import {{ state, watch }} from '@kerf/core'; const n = state(0); \
             watch(async () => {{ {body} }}, () => n.value++)"
        );
        let (_, diagnostics) = run(&source);
        assert_eq!(
            watch_cycle_errors(&diagnostics).len(),
            count,
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w003_nested_target_evaluation_keeps_each_pending_getter_separate() {
    for (body, count) in [
        (
            "let v; const target = {}; \
             ({ value: target[({ value: v } = other, 'key')] } = n); return v",
            1,
        ),
        (
            "let v; const target = {}; \
             ({ value: target[({ value: v } = n, 'key')] } = other); return v",
            1,
        ),
        (
            "let v; const target = {}; \
             ({ value: target[({ value: v } = other, await key())] } = n); return v",
            0,
        ),
    ] {
        let source = format!(
            "import {{ state, watch }} from '@kerf/core'; \
             const n = state(0); const other = state(0); \
             watch(async () => {{ {body} }}, () => n.value++)"
        );
        assert_eq!(watch_cycle_errors(&run(&source).1).len(), count, "{source}");
    }
}

#[test]
fn w012_assignment_target_and_default_order_stays_the_same() {
    for (body, count) in [
        ("({ x: n.value.field } = await load()); return 0", 1),
        ("({ x: n.value.field = 0 } = await load()); return 0", 1),
        ("({ x: n.value.field = await load() } = {}); return 0", 0),
        (
            "({ x: { y: n.value.field } = await load() } = {}); return 0",
            1,
        ),
        ("({ [await key()]: n.value.field } = {}); return 0", 1),
        ("n.value.field = await load(); return 0", 0),
        ("n.value[await key()] = 0; return 0", 0),
    ] {
        let source = resource_with_state("{ field: 0 }", body);
        let (_, diagnostics) = run(&source);
        assert_eq!(
            async_callback_errors(&diagnostics).len(),
            count,
            "{source}: {diagnostics:?}"
        );
    }
}
