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
            "import {{ state, watch, derived }} from '@weft-js/core'; \
             export function A() {{ const result = {repaired}; return <p /> }}"
        );
        assert!(run(&fixed).1.is_empty(), "{hook}: {}", fixed);
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
fn w020_custom_hook_calls_in_component_setup_need_plain_functions() {
    let cases = [
        ("", "useCart()"),
        ("function useCart() { return 1 }", "useCart()"),
        ("const useCart = () => 1", "useCart()"),
        ("import { useCart as cart } from './cart'", "cart()"),
        ("import * as cart from './cart'", "cart.useCart()"),
        ("import { useCart as cart } from 'react'", "cart()"),
    ];
    for (prefix, call) in cases {
        let source = format!("{prefix}; export const A = () => {{ {call}; return <p /> }}");
        let (_, diagnostics) = run(&source);
        assert_eq!(codes(&diagnostics), ["W020"], "{source}: {diagnostics:?}");
        assert!(diagnostics[0].help.contains("ordinary function"));
        assert!(diagnostics[0].fix.is_none());
    }
    let (_, diagnostics) = run("import { state } from '@weft-js/core'; \
         function cart() { return state(0) } \
         export function A() { const value = cart(); return <p>{value.value}</p> }");
    assert!(diagnostics.is_empty(), "{diagnostics:?}");
}

#[test]
fn w020_dependency_arrays_on_core_apis_need_tracked_reads() {
    let cases = [
        (
            "import { derived } from '@weft-js/core'",
            "derived(() => 1, [1])",
        ),
        (
            "import { memo as cache } from '@weft-js/core'",
            "cache(() => 1, [1])",
        ),
        (
            "import * as core from '@weft-js/core'",
            "core.watch(() => {}, [])",
        ),
        (
            "import { watch } from '@weft-js/core'",
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
        run("import { watch, derived, memo } from '@weft-js/core'; \
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
            "import {{ derived, memo as cache }} from '@weft-js/core'; \
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
            "import {{ derived }} from '@weft-js/core'; \
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
        let source = format!("export function A() {{ {body} }}");
        let (_, diagnostics) = run(&source);
        assert_eq!(codes(&diagnostics), ["W020"], "{source}: {diagnostics:?}");
    }
}

#[test]
fn w020_ordinary_functions_and_shadowed_imports_stay_quiet() {
    let sources = [
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
        "import { derived } from '@weft-js/core'; \
         export function A() { const derived = fn => fn(); \
         derived(() => 1, []); return <p /> }",
        "import { state } from '@weft-js/core'; \
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
