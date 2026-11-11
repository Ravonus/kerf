// W020 keeps migration advice specific without silently rewriting React semantics.

#[test]
fn w020_react_hooks_have_errors_and_specific_manual_fixes() {
    let cases = [
        ("useState", "0", "state(initial)", "state(0)"),
        (
            "useEffect",
            "() => {}, []",
            "watch(() => source",
            "watch(() => 1, () => {})",
        ),
        (
            "useMemo",
            "() => 1, []",
            "derived(() => expression)",
            "derived(() => 1)",
        ),
        ("useRef", "null", "ref={el}", "state(null)"),
        ("useCallback", "() => {}, []", "plain function", "() => {}"),
    ];
    for (hook, args, help, repaired) in cases {
        let source = format!(
            "import {{ {hook} }} from 'react'; \
             export function A() {{ const result = {hook}({args}); return <p /> }}"
        );
        let (_, diagnostics) = run(&source);
        assert_eq!(codes(&diagnostics), ["W020"], "{hook}: {diagnostics:?}");
        let diagnostic = &diagnostics[0];
        assert_eq!(diagnostic.severity, Severity::Error);
        assert!(diagnostic.message.contains(hook), "{diagnostic:?}");
        assert!(diagnostic.help.contains(help), "{diagnostic:?}");
        assert!(diagnostic.fix.is_none(), "hook migrations need review");
        let fixed = format!(
            "import {{ state, watch, derived }} from '@kerf-js/core'; \
             export function A() {{ const result = {repaired}; return <p /> }}"
        );
        assert!(run(&fixed).1.is_empty(), "{hook}: {fixed}");
    }
}

#[test]
fn w020_resolves_aliases_namespaces_and_hoisted_imports() {
    let cases = [
        (
            "import { useState as make } from 'react'",
            "make(0)",
            "useState",
        ),
        (
            "import React from 'react'",
            "React.useEffect(() => {}, [])",
            "useEffect",
        ),
        (
            "import * as R from 'react'",
            "R.useMemo(() => 1, [])",
            "useMemo",
        ),
        ("import * as R from 'react'", "R['useRef'](null)", "useRef"),
        (
            "import { useCallback as cb } from 'react'",
            "(cb)(() => {}, [])",
            "useCallback",
        ),
        ("import * as R from 'react'", "R?.useState(0)", "useState"),
    ];
    for (import, call, name) in cases {
        let source = format!("export function A() {{ {call}; return <p /> }}; {import}");
        let (_, diagnostics) = run(&source);
        assert_eq!(codes(&diagnostics), ["W020"], "{source}: {diagnostics:?}");
        assert!(diagnostics[0].message.contains(name), "{diagnostics:?}");
    }
}

#[test]
fn w020_imported_custom_hook_calls_need_plain_functions() {
    let cases = [
        ("import { useCart as cart } from 'react'", "cart()"),
        ("import * as cart from 'react'", "cart.useCart()"),
        ("import * as cart from 'react'", "cart['useCart']()"),
    ];
    for (prefix, call) in cases {
        let source = format!("{prefix}; export const A = () => {{ {call}; return <p /> }}");
        let (_, diagnostics) = run(&source);
        assert_eq!(codes(&diagnostics), ["W020"], "{source}: {diagnostics:?}");
        assert!(diagnostics[0].help.contains("ordinary function"));
        assert!(diagnostics[0].fix.is_none());
    }
    let (_, diagnostics) = run("import { state } from '@kerf-js/core'; \
         function cart() { return state(0) } \
         export function A() { const value = cart(); return <p>{value.value}</p> }");
    assert!(diagnostics.is_empty(), "{diagnostics:?}");
}

#[test]
fn w020_dependency_arrays_on_core_apis_need_tracked_reads() {
    let cases = [
        (
            "import { derived } from '@kerf-js/core'",
            "derived(() => 1, [1])",
        ),
        (
            "import { memo as cache } from '@kerf-js/core'",
            "cache(() => 1, [1])",
        ),
        (
            "import * as core from '@kerf-js/core'",
            "core.watch(() => {}, [])",
        ),
        (
            "import { watch } from '@kerf-js/core'",
            "watch(() => 1, () => {}, [])",
        ),
    ];
    for (import, call) in cases {
        let source = format!("{import}; export function A() {{ {call}; return <p /> }}");
        let (_, diagnostics) = run(&source);
        assert_eq!(codes(&diagnostics), ["W020"], "{source}: {diagnostics:?}");
        assert_eq!(diagnostics[0].severity, Severity::Error);
        assert!(diagnostics[0].message.contains("dependency array"));
        assert!(diagnostics[0].help.contains("tracked"));
        assert!(diagnostics[0].fix.is_none());
    }
    assert!(
        run("import { watch, derived, memo } from '@kerf-js/core'; \
         export function A() { watch(() => 1, () => {}); \
         derived(() => 1); memo(() => 1); return <p /> }",)
        .1
        .is_empty()
    );
}

#[test]
fn w020_only_empty_memo_dependency_arrays_have_safe_autofixes() {
    for call in [
        "derived(() => 1, [])",
        "derived(() => 1, [],)",
        "cache(() => 1, [])",
    ] {
        let source = format!(
            "import {{ derived, memo as cache }} from '@kerf-js/core'; \
             export function A() {{ {call}; return <p /> }}"
        );
        let (_, diagnostics) = run(&source);
        assert_eq!(codes(&diagnostics), ["W020"], "{diagnostics:?}");
        assert!(diagnostics[0].fix.as_ref().unwrap().safe);
        let fixed = apply_fix(&source, &diagnostics[0]);
        assert!(run(&fixed).1.is_empty(), "{fixed}");
    }
    for args in [
        "[sideEffect()]",
        "([])",
        "[] as unknown[]",
        "[] satisfies unknown[]",
        "/* , keep */ []",
    ] {
        let source = format!(
            "import {{ derived }} from '@kerf-js/core'; \
             export function A() {{ derived(() => 1, {args}); return <p /> }}"
        );
        let (_, diagnostics) = run(&source);
        assert_eq!(codes(&diagnostics), ["W020"], "{diagnostics:?}");
        assert!(diagnostics[0].fix.is_none(), "{source}");
    }
}

#[test]
fn w020_unbound_hook_names_in_component_setup_are_errors() {
    for hook in ["useState", "useEffect", "useMemo", "useRef", "useCallback"] {
        let source = format!("export function A() {{ {hook}(); return <p /> }}");
        let (_, diagnostics) = run(&source);
        assert_eq!(codes(&diagnostics), ["W020"], "{source}: {diagnostics:?}");
    }
}

#[test]
fn w020_custom_hooks_in_jsx_and_handlers_are_errors() {
    for body in [
        "return <p>{useCart()}</p>",
        "return <button onClick={() => useCart()} />",
    ] {
        let source = format!(
            "import {{ useState }} from 'react'; function useCart() {{ return useState(0) }} \
             export function A() {{ {body} }}"
        );
        let (_, diagnostics) = run(&source);
        assert_eq!(
            codes(&diagnostics),
            ["W020", "W020"],
            "{source}: {diagnostics:?}"
        );
    }
}

#[test]
fn w020_resolved_react_wrappers_are_hooks_at_the_component_call() {
    let cases = [
        (
            "import { useState as make } from 'react'",
            "function useCart() { return make(0) }",
            "useCart",
            2,
        ),
        (
            "import React from 'react'",
            "const useCart = () => React.useRef(null)",
            "useCart",
            2,
        ),
        (
            "import * as R from 'react'",
            "const useCart = function () { return R['useMemo'](() => 1, []) }",
            "useCart",
            2,
        ),
        (
            "import { useState } from 'react'",
            "function useCart() { return useState(0) } \
             function useCheckout() { return useCart() }",
            "useCheckout",
            2,
        ),
        (
            "import { useCart as remote } from 'react'",
            "const useCheckout = () => remote()",
            "useCheckout",
            2,
        ),
    ];
    for (import, wrapper, name, count) in cases {
        let source =
            format!("{import}; export function A() {{ {name}(); return <p /> }}; {wrapper}");
        let (_, diagnostics) = run(&source);
        assert_eq!(diagnostics.len(), count, "{source}: {diagnostics:?}");
        assert!(diagnostics.iter().all(|d| d.code == "W020"));
        assert!(
            diagnostics.iter().any(|d| {
                d.message.starts_with(&format!("`{name}` is a React hook"))
                    && d.help.contains("ordinary function")
                    && d.severity == Severity::Error
                    && d.fix.is_none()
            }),
            "{diagnostics:?}"
        );
    }
}

#[test]
fn w020_ordinary_use_cart_functions_and_shadowing_parameters_stay_quiet() {
    let sources = [
        "function useCart() { return 1 } \
         export function A() { const n = useCart(); return <p>{n}</p> }",
        "const useCart = () => 1; export function A() { return <p>{useCart()}</p> }",
        "const useCart = function () { return 1 }; \
         export function A() { return <p>{useCart()}</p> }",
        "const api = { useState: n => n }; function useCart() { return api.useState(0) } \
         export function A() { return <p>{useCart()}</p> }",
        "import { useCart } from './cart'; \
         export function A() { const useCart = () => 1; return <p>{useCart()}</p> }",
        "import { useCart } from './cart'; \
         export function A(useCart) { return <p>{useCart()}</p> }",
        "import { useCart } from './cart'; \
         export function A({ useCart }) { return <p>{useCart()}</p> }",
        "import { useState } from 'react'; \
         function useCart(useState) { return useState(0) } \
         export function A() { return <p>{useCart(n => n)}</p> }",
        "function useCart() { return 1 } \
         function useCheckout() { return useCart() } \
         export function A() { return <p>{useCheckout()}</p> }",
    ];
    for source in sources {
        let (code, diagnostics) = run(source);
        assert!(diagnostics.is_empty(), "{source}: {diagnostics:?}");
        assert!(!code.is_empty(), "ordinary functions must still compile");
    }
}

#[test]
fn w020_wrapper_provenance_excludes_reassignments_and_deferred_callbacks() {
    for (wrapper, component) in [
        (
            "let useCart = () => useState(0); useCart = () => 1",
            "export function A() { useCart(); return <p /> }",
        ),
        (
            "function useCart() { const deferred = () => useState(0); return 1 }",
            "export function A() { useCart(); return <p /> }",
        ),
        (
            "function useCart() { return useState(0) }",
            "export function A(useCart) { return <p>{useCart()}</p> }",
        ),
    ] {
        let source = format!("import {{ useState }} from 'react'; {wrapper}; {component}");
        let (_, diagnostics) = run(&source);
        assert_eq!(codes(&diagnostics), ["W020"], "{source}: {diagnostics:?}");
        assert!(diagnostics[0].message.starts_with("`useState`"));
    }
}

#[test]
fn w020_memo_dependency_advice_reads_the_returned_callable() {
    let source = "import { memo as cache } from '@kerf-js/core'; \
        export function A() { const value = cache(() => 1, []); return <p>{value()}</p> }";
    let (_, diagnostics) = run(source);
    assert_eq!(codes(&diagnostics), ["W020"], "{diagnostics:?}");
    assert!(diagnostics[0].help.contains("returns a callable"));
    assert!(diagnostics[0].help.contains("`value()`"));
    assert!(!diagnostics[0].help.contains(".value"));
    let repaired = apply_fix(source, &diagnostics[0]);
    let (code, diagnostics) = run(&repaired);
    assert!(diagnostics.is_empty(), "{repaired}: {diagnostics:?}");
    assert!(
        code.contains("cache(() => 1)") && code.contains("value()"),
        "{code}"
    );
}

#[test]
fn w020_ordinary_functions_and_shadowed_imports_stay_quiet() {
    let sources = [
        // Relative imports match the canonical Card, DurationField, Sources and Otp helpers.
        "import { untrack } from '@kerf-js/core'; import { useUi } from './use-ui'; \
         export function Card() { useUi(() => undefined, () => undefined); return <p /> }",
        "import { derived, state, untrack } from '@kerf-js/core'; \
         import { bindable, Composite, Hidden, usePickerEnv } from './Picker'; \
         export function DurationField() { const env = usePickerEnv({}); return <p /> }",
        "import { derived } from '@kerf-js/core'; import { Sweep, useSweep } from './bits'; \
         export function Sources() { useSweep(); return <p /> }",
        "import { state, untrack, watch } from '@kerf-js/core'; import { useStepForm } from './kit'; \
         export function Otp() { const ctl = useStepForm<{ code: string }>(untrack(() => ({}))); return <p /> }",
        "import { useUi as attach } from './use-ui'; \
         export function Card() { attach(); return <p /> }",
        "import * as picker from './Picker'; \
         export function DurationField() { picker.usePickerEnv(); return <p /> }",
        "import { useSweep } from './bits'; function useLocal() { return useSweep() } \
         export function Sources() { useLocal(); return <p /> }",
        "import { use } from '@kerf-js/veneer-core/kerf'; import { untrack } from '@kerf-js/core'; \
         function useUi(ui, host) { const row = untrack(ui); if (row) use(row.attach, host) } \
         export function Card() { useUi(() => undefined, () => undefined); return <p /> }",
        "import { useCart } from './cart'; export function A() { useCart(); return <p /> }",
        "import * as cart from './cart'; function useCheckout() { return cart.useCart() } \
         export function A() { useCheckout(); return <p /> }",
        "function useState(n) { return n } \
         export function A() { useState(0); return <p /> }",
        "import { useState } from './ordinary'; \
         export function A() { useState(0); return <p /> }",
        "import { useState as make } from 'react'; \
         export function A() { const make = n => n; make(0); return <p /> }",
        "import * as React from 'react'; \
         export function A() { const React = { useMemo: fn => fn() }; \
         React.useMemo(() => 1, []); return <p /> }",
        "export function A() { const api = { useState: n => n, useCart: () => 1 }; \
         api.useState(0); api.useCart(); useful(); use(); usex(); use_data(); return <p /> }",
        "import { derived } from './ordinary'; \
         export function A() { derived(() => 1, []); return <p /> }",
        "import { derived } from '@kerf-js/core'; \
         export function A() { const derived = fn => fn(); \
         derived(() => 1, []); return <p /> }",
        "import { state } from '@kerf-js/core'; \
         export function A() { const items = state([1, 2]); return <p /> }",
        "import type { useState } from 'react'; \
         export function A() { return <p /> }",
        "function useTool() { return 1 } export const result = useTool()",
    ];
    for source in sources {
        let (code, diagnostics) = run(source);
        assert!(diagnostics.is_empty(), "{source}: {diagnostics:?}");
        assert!(
            !code.is_empty(),
            "correct source must still compile: {source}"
        );
    }
}

#[test]
fn w020_react_wrappers_do_not_exempt_canonical_helper_names() {
    for name in ["useUi", "usePickerEnv", "useSweep", "useStepForm"] {
        let source = format!(
            "import {{ useState }} from 'react'; function {name}() {{ return useState(0) }} \
             export function A() {{ {name}(); return <p /> }}"
        );
        let (_, diagnostics) = run(&source);
        assert_eq!(
            codes(&diagnostics),
            ["W020", "W020"],
            "{source}: {diagnostics:?}"
        );
        assert!(
            diagnostics
                .iter()
                .any(|d| d.message.starts_with(&format!("`{name}`")))
        );
    }
}
