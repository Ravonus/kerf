#[test]
fn compiled_prop_helpers_use_the_internal_runtime_contract() {
    let source = include_str!("../../../../packages/core/test/fixtures/internal/Props.tsx");
    for (generate, dev, hydratable) in [
        ("dom", false, false),
        ("dom", true, false),
        ("dom", false, true),
        ("ssr", false, true),
    ] {
        let out = compile(
            source,
            &Options {
                filename: "Props.tsx".into(),
                generate: generate.into(),
                dev,
                hydratable,
                ..Default::default()
            },
        );
        assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
        let code = out.code.expect("compiled fixture");
        let internal = code.lines().find(|line| {
            line.starts_with("import ") && line.contains("\"@kerf/core/internal\"")
        });
        let internal = internal.expect("an internal helper import");
        assert!(internal.contains("localProps as _$localProps"), "{code}");
        assert!(internal.contains("restOf as _$restOf"), "{code}");
        assert!(
            code.contains(r#"import { memo as _$kerfMemo } from "@kerf/core""#),
            "{code}"
        );
        for line in code
            .lines()
            .filter(|line| line.ends_with(r#"from "@kerf/core";"#))
        {
            assert!(
                !line.contains("localProps") && !line.contains("restOf"),
                "{code}"
            );
        }
    }
}
