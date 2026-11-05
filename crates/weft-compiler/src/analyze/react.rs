//! React hook names need migration advice, not a rename that changes their meaning.

use std::collections::HashMap;

use oxc_ast::ast::{
    CallExpression, Expression, ImportDeclarationSpecifier, ImportOrExportKind, Program, Statement,
};
use oxc_semantic::SymbolId;
use oxc_span::GetSpan;

use crate::diag::{Diagnostic, Edit, Fix, Severity};

use super::{Analyzer, binding_symbol, symbol_of};

pub(super) fn imports(program: &Program<'_>) -> HashMap<SymbolId, (String, String)> {
    let mut imports = HashMap::new();
    // Imports are hoisted, so calls before their import declaration need the same check.
    for statement in &program.body {
        let Statement::ImportDeclaration(import) = statement else {
            continue;
        };
        if import.import_kind == ImportOrExportKind::Type {
            continue;
        }
        for spec in import.specifiers.iter().flatten() {
            let (local, name) = match spec {
                ImportDeclarationSpecifier::ImportSpecifier(s) => {
                    if s.import_kind == ImportOrExportKind::Type {
                        continue;
                    }
                    (&s.local, s.imported.name().to_string())
                }
                ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => {
                    (&s.local, "default".into())
                }
                ImportDeclarationSpecifier::ImportNamespaceSpecifier(s) => (&s.local, "*".into()),
            };
            if let Some(sym) = binding_symbol(local) {
                imports.insert(sym, (import.source.value.to_string(), name));
            }
        }
    }
    imports
}

fn hook_name(name: &str) -> bool {
    name.strip_prefix("use")
        .and_then(|rest| rest.chars().next())
        .is_some_and(|c| c.is_ascii_uppercase())
}

fn known_hook(name: &str) -> bool {
    matches!(
        name,
        "useState" | "useEffect" | "useMemo" | "useRef" | "useCallback"
    )
}

fn hook_help(name: &str) -> &'static str {
    match name {
        "useState" => {
            "Use `state(initial)` from `@weft-js/core`, read `box.value`, and assign \
            `box.value = next`. For a prop-driven initial value use `state.linked(() => prop)`."
        }
        "useEffect" => {
            "Use `watch(() => source, value => { … })` from `@weft-js/core` for reactive \
            effects and `onCleanup(() => …)` for cleanup. Dependencies are tracked; omit the array."
        }
        "useMemo" => {
            "Use `derived(() => expression)` from `@weft-js/core` and read `box.value`. \
            Dependencies are tracked; omit the array."
        }
        "useRef" => {
            "For a DOM ref, declare `let el` and write `ref={el}`. For a reactive value, \
            use `state(initial)` from `@weft-js/core` and read or write `.value`, not `.current`."
        }
        "useCallback" => {
            "Use a plain function: `const handler = (…) => { … }`. Component setup \
            runs once, so the function keeps its identity without a dependency array."
        }
        _ => {
            "Replace the custom `useX()` hook with an ordinary function built from `state`, \
            `derived`, and `watch` from `@weft-js/core`. Components run once; track `.value` \
            reads instead of using React hook ordering or dependency arrays."
        }
    }
}

impl Analyzer<'_> {
    fn react_import<'b>(&'b self, call: &'b CallExpression<'_>) -> Option<(&'b str, &'b str)> {
        let (object, member) = match call.callee.get_inner_expression() {
            Expression::Identifier(id) => {
                let (module, name) = self.react_imports.get(&symbol_of(self.scoping, id)?)?;
                return Some((module, name));
            }
            Expression::StaticMemberExpression(m) => (&m.object, m.property.name.as_str()),
            Expression::ComputedMemberExpression(m) => {
                let Expression::StringLiteral(name) = m.expression.get_inner_expression() else {
                    return None;
                };
                (&m.object, name.value.as_str())
            }
            _ => return None,
        };
        let Expression::Identifier(id) = object.get_inner_expression() else {
            return None;
        };
        let (module, name) = self.react_imports.get(&symbol_of(self.scoping, id)?)?;
        matches!(name.as_str(), "default" | "*").then_some((module, member))
    }

    pub(super) fn react_call(&mut self, call: &CallExpression<'_>) {
        if let Some((module, name)) = self.react_import(call) {
            if module == "@weft-js/core" && matches!(name, "watch" | "derived" | "memo") {
                let name = name.to_string();
                self.dependency_array(call, &name);
                return;
            }
            if hook_name(name)
                && (module == "react" || (!self.comps.is_empty() && !known_hook(name)))
            {
                let name = name.to_string();
                self.react_hook(call, &name);
            }
            return;
        }
        if let Expression::Identifier(id) = call.callee.get_inner_expression()
            && !self.comps.is_empty()
            && hook_name(id.name.as_str())
            // A locally bound useState may be an ordinary function; React imports resolve above.
            && (symbol_of(self.scoping, id).is_none() || !known_hook(id.name.as_str()))
        {
            self.react_hook(call, id.name.as_str());
        }
    }

    fn react_hook(&mut self, call: &CallExpression<'_>, name: &str) {
        let span = call.callee.span();
        self.plan.diagnostics.push(Diagnostic::new(
            self.source,
            "W020",
            Severity::Error,
            (span.start, span.end),
            format!(
                "`{name}` is a React hook; weft component setup runs once, not on every update."
            ),
            hook_help(name),
        ));
    }

    fn dependency_array(&mut self, call: &CallExpression<'_>, name: &str) {
        if call.arguments.len() < 2 {
            return;
        }
        let Some(Expression::ArrayExpression(array)) = call
            .arguments
            .last()
            .and_then(|arg| arg.as_expression())
            .map(Expression::get_inner_expression)
        else {
            return;
        };
        let help = if name == "watch" {
            "Use `watch(() => source, value => { … })`. Its second argument is a callback; \
             dependencies are tracked from the source. Omit the dependency array."
        } else {
            "Remove the dependency array; reads inside the callback are tracked automatically. \
             Read the resulting box with `.value`."
        };
        let mut diagnostic = Diagnostic::new(
            self.source,
            "W020",
            Severity::Error,
            (array.span.start, array.span.end),
            format!("`{name}` does not take a React dependency array."),
            help,
        );
        // Removing a nonempty array could discard side effects in its elements.
        if name != "watch"
            && call.arguments.len() == 2
            && array.elements.is_empty()
            && matches!(
                call.arguments[1].as_expression(),
                Some(Expression::ArrayExpression(_))
            )
        {
            let previous = call.arguments[0].span();
            let between = &self.source[previous.end as usize..array.span.start as usize];
            if between.trim() == "," {
                diagnostic = diagnostic.with_fix(Fix {
                    description: "Remove the empty dependency array".into(),
                    safe: true,
                    edits: vec![Edit {
                        start: previous.end,
                        end: array.span.end,
                        text: String::new(),
                    }],
                });
            }
        }
        self.plan.diagnostics.push(diagnostic);
    }
}
