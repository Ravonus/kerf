// Literal and local property lookups must agree on the last write.

fn numeric_property_case(fields: &str, property: &str, expected: usize) {
    for expression in [format!("({{{fields}}})"), "model".to_string()] {
        let source = format!(
            "declare const other: any; declare const key: string; \
             const numeric = {{ count: 0, length: 0 }}; \
             const boolean = {{ count: false, length: false }}; const alias = numeric; \
             export function A() {{ const model = {{{fields}}}; \
             return <p>{{{expression}.{property} && <i />}}</p> }}"
        );
        let (_, diagnostics) = run(&source);
        let errors = numeric_jsx_errors(&diagnostics);
        assert_eq!(errors.len(), expected, "{source}: {diagnostics:?}");
        if let Some(error) = errors.first() {
            assert_eq!(error.severity, Severity::Error);
            assert!(error.fix.as_ref().unwrap().safe);
            let repaired = apply_fix(&source, error);
            assert!(run(&repaired).1.is_empty(), "{repaired}");
        }
    }
}

#[test]
fn w011_duplicate_properties_and_literal_spreads_use_the_last_write() {
    for property in ["count", "length"] {
        for (fields, expected) in [
            (format!("{property}: false, {property}: 0"), 1),
            (format!("{property}: 0, {property}: false"), 0),
            (format!("{property}: false, ...{{ {property}: 0 }}"), 1),
            (format!("{property}: 0, ...{{ {property}: false }}"), 0),
            (format!("...{{ {property}: false }}, {property}: 0"), 1),
            (format!("...{{ {property}: 0 }}, {property}: false"), 0),
            (
                format!("{property}: 0, ...{{ ...{{ {property}: false }} }}"),
                0,
            ),
            (format!("{property}: 0, ...{{ unrelated: true }}"), 1),
        ] {
            numeric_property_case(&fields, property, expected);
        }
    }
}

#[test]
fn w011_known_alias_spreads_and_unknown_overwrites_follow_write_order() {
    for property in ["count", "length"] {
        for (fields, expected) in [
            (format!("{property}: false, ...numeric"), 1),
            (format!("{property}: false, ...alias"), 1),
            (format!("{property}: 0, ...boolean"), 0),
            (format!("...numeric, ...boolean"), 0),
            (format!("...boolean, ...numeric"), 1),
            (format!("...numeric, {property}: false"), 0),
            (format!("{property}: 0, ...other"), 0),
            (format!("{property}: false, ...other"), 0),
            (format!("{property}: 0, ...{{ ...other }}"), 0),
            (format!("{property}: 0, [key]: false"), 0),
            (format!("{property}: false, ...other, {property}: 0"), 1),
            (format!("{property}: 0, ...other, {property}: false"), 0),
            (format!("{property}: 0, ...{{ unrelated: other }}"), 1),
        ] {
            numeric_property_case(&fields, property, expected);
        }
    }
}

#[test]
fn w011_member_writes_drop_property_facts_in_both_type_directions() {
    for setup in [
        "const model = { count: 0 }; model.count = false",
        "const model = { count: false }; model.count = 0",
        "const model = { count: 0 }; model['count'] = false",
        "const model = { count: 0 }; const key = read(); model[key] = false",
        "const model = { count: 0 }; model.count++",
        "const model = { count: 0 }; delete model.count",
        "const model = { count: 0 }; const alias = model; alias.count = false",
        "const model = { count: false }; const alias = model; alias.count = 0",
        "const model = { count: 0 }; const alias = model; model.count = false",
        "const model = { count: 0 }; let alias; alias = model; alias.count = false",
        "const model = { count: 0 }; const holder = { ref: model }; holder.ref.count = false",
        "const model = { count: 0 }; const holder = {}; \
         holder.ref = model; holder.ref.count = false",
    ] {
        let source =
            format!("export function A() {{ {setup}; return <p>{{model.count && <i />}}</p> }}");
        let (_, diagnostics) = run(&source);
        assert!(
            numeric_jsx_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
    for source in [
        "export function A() { const model = { count: 0 }; const alias = model; \
         alias.count = false; return <p>{alias.count && <i />}</p> }",
        "export function A() { const model = { nested: { count: 0 } }; const alias = model.nested; \
         alias.count = false; return <p>{model.nested.count && <i />}</p> }",
        "export function A() { const model = { length: 0 }; const alias = model; \
         alias.length = false; return <p>{({ ...model }).length && <i />}</p> }",
    ] {
        let (_, diagnostics) = run(source);
        assert!(
            numeric_jsx_errors(&diagnostics).is_empty(),
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w011_forward_property_aliases_refresh_and_unrelated_symbols_stay_numeric() {
    for (source, expected) in [
        (
            "export function A() { const n = model.length; return <p>{n && <i />}</p> } \
          const model = { length: 0, ...{ length: false } }",
            0,
        ),
        (
            "export function A() { const n = model.length; return <p>{n && <i />}</p> } \
          const model = { length: false, ...{ length: 0 } }",
            1,
        ),
        (
            "declare const other: any; export function A() { const n = model.length; \
          return <p>{n && <i />}</p> } const model = { length: 0, ...other }",
            0,
        ),
        (
            "declare const other: any; export function A() { const n = model.length - 1; \
          return <p>{n && <i />}</p> } const model = { length: 0, ...other }",
            0,
        ),
        (
            "export function A() { const model = { count: 0 }; \
          const other = { count: 0 }; other.count = false; return <p>{model.count && <i />}</p> }",
            1,
        ),
        (
            "export function A() { const model = { count: 0 }; \
          function unrelated(model) { model.count = false } return <p>{model.count && <i />}</p> }",
            1,
        ),
        (
            "import { state } from '@weft-js/core'; export function A() { const n = state(0); \
          const other = state<any>(0); other.value = false; return <p>{n.value && <i />}</p> }",
            1,
        ),
    ] {
        let (_, diagnostics) = run(source);
        assert_eq!(
            numeric_jsx_errors(&diagnostics).len(),
            expected,
            "{source}: {diagnostics:?}"
        );
    }
}
