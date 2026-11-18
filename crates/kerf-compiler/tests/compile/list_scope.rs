#[test]
fn a_block_rows_key_stays_with_its_locals() {
    for (callback, setup, key) in [
        (
            "x => { const mint = mintFor(x); return <li key={mint}>{mint}</li> }",
            "const mint = mintFor(x());",
            "mint",
        ),
        (
            "({ data: { id }, parts }) => { const [first] = parts; return <li key={id + first}>{first}</li> }",
            "const [first] = _item().parts;",
            "_item().data.id + first",
        ),
        (
            "x => { let id = x.id; { const next = id.toUpperCase(); id = next } return <li key={id}>{id}</li> }",
            "let id = x().id;",
            "id",
        ),
        (
            "(x, i) => { const a = x.id; const b = String(i); return <li key={a + b}>{i}</li> }",
            "const b = String(i());",
            "a + b",
        ),
        (
            "function (x) { const id = x.id; return <li key={(() => id)()}>{id}</li> }",
            "const id = x().id;",
            "(() => id)()",
        ),
    ] {
        let code = clean(&format!(
            "const id = 'outer'; export function L({{ xs }}) {{ return <ul>{{xs.map({callback})}}</ul> }}"
        ));
        assert!(code.contains("prepare:") && !code.contains("by:"), "{code}");
        assert!(code.contains(setup), "{code}");
        assert!(code.contains(&format!("return [{key}, () =>")), "{code}");
    }
}

#[test]
fn row_keys_with_only_outer_and_parameter_bindings_keep_by() {
    for callback in [
        "(x, i) => <li key={prefix + x.id + i}>{i}</li>",
        "(x, i) => { return <li key={prefix + x.id + i}>{i}</li> }",
    ] {
        let code = clean(&format!(
            "const prefix = 'outer'; export function L({{ xs }}) {{ return <ul>{{xs.map({callback})}}</ul> }}"
        ));
        assert!(code.contains("by: (x, i) => prefix + x.id + i"), "{code}");
        assert!(!code.contains("prepare:"), "{code}");
    }
}

#[test]
fn w009_a_scoped_key_requires_one_element_and_a_sync_row_signature() {
    for callback in [
        "x => { const id = x.id; return x.on ? <li key={id} /> : <li key={id} /> }",
        "x => { const id = x.id; return <><li key={id} /></> }",
        "async x => { const id = await x.id; return <li key={id} /> }",
        "(x, i, xs) => { const id = x.id + xs.length; return <li key={id} /> }",
        "function (x) { const id = this.key(x); return <li key={id} /> }, ctx",
    ] {
        let (code, d) = run(&format!(
            "export function L({{ xs }}) {{ return <ul>{{xs.map({callback})}}</ul> }}"
        ));
        assert_eq!(codes(&d), ["W009"], "{d:?}");
        assert_eq!(d[0].severity, Severity::Error);
        assert!(
            !code.contains("by:") && !code.contains("prepare:"),
            "{code}"
        );
    }
}
