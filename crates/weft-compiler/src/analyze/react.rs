//! React hook names need migration advice, not a rename that changes their meaning.

use std::collections::{HashMap, HashSet};

use oxc_ast::ast::{
    ArrowFunctionExpression, BindingIdentifier, BindingPattern, CallExpression, Expression,
    Function, ImportDeclarationSpecifier, ImportOrExportKind, Program, Statement,
    VariableDeclarator,
};
use oxc_ast_visit::{Visit, walk};
use oxc_semantic::{Scoping, SymbolId};
use oxc_span::GetSpan;
use oxc_syntax::scope::ScopeFlags;

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

fn hook_import(module: &str, name: &str) -> bool {
    hook_name(name) && (module == "react" || !known_hook(name))
}

pub(super) fn imported_call<'b>(
    call: &'b CallExpression<'_>,
    scoping: &Scoping,
    imports: &'b HashMap<SymbolId, (String, String)>,
) -> Option<(&'b str, &'b str)> {
    let (object, member) = match call.callee.get_inner_expression() {
        Expression::Identifier(id) => {
            let (module, name) = imports.get(&symbol_of(scoping, id)?)?;
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
    let (module, name) = imports.get(&symbol_of(scoping, id)?)?;
    matches!(name.as_str(), "default" | "*").then_some((module, member))
}

/// Follow direct calls in stable useX functions; each nested callback has its own body.
pub(super) fn wrappers(
    program: &Program<'_>,
    scoping: &Scoping,
    imports: &HashMap<SymbolId, (String, String)>,
) -> HashSet<SymbolId> {
    let mut scan = Wrappers {
        scoping,
        imports,
        stack: Vec::new(),
        pending: None,
        found: HashSet::new(),
        calls: Vec::new(),
    };
    scan.visit_program(program);
    loop {
        let before = scan.found.len();
        for &(caller, callee) in &scan.calls {
            if scan.found.contains(&callee) {
                scan.found.insert(caller);
            }
        }
        if scan.found.len() == before {
            return scan.found;
        }
    }
}

struct Wrappers<'s> {
    scoping: &'s Scoping,
    imports: &'s HashMap<SymbolId, (String, String)>,
    stack: Vec<Option<SymbolId>>,
    pending: Option<SymbolId>,
    found: HashSet<SymbolId>,
    calls: Vec<(SymbolId, SymbolId)>,
}

impl Wrappers<'_> {
    fn symbol(&self, id: &BindingIdentifier<'_>) -> Option<SymbolId> {
        if !hook_name(id.name.as_str()) {
            return None;
        }
        binding_symbol(id).filter(|&sym| {
            !self
                .scoping
                .get_resolved_references(sym)
                .any(oxc_semantic::Reference::is_write)
        })
    }
}

impl<'a> Visit<'a> for Wrappers<'_> {
    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        let previous = self.pending.take();
        if let (BindingPattern::BindingIdentifier(id), Some(init)) = (&it.id, &it.init)
            && matches!(
                init.get_inner_expression(),
                Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_)
            )
        {
            self.pending = self.symbol(id);
        }
        walk::walk_variable_declarator(self, it);
        self.pending = previous;
    }

    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        let symbol = self
            .pending
            .take()
            .or_else(|| it.id.as_ref().and_then(|id| self.symbol(id)));
        self.stack.push(symbol);
        walk::walk_function(self, it, flags);
        self.stack.pop();
    }

    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        self.stack.push(self.pending.take());
        walk::walk_arrow_function_expression(self, it);
        self.stack.pop();
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        // Nested functions have their own stack entry; a deferred callback is not an outer hook call.
        if let Some(&Some(caller)) = self.stack.last() {
            if imported_call(it, self.scoping, self.imports)
                .is_some_and(|(module, name)| hook_import(module, name))
            {
                self.found.insert(caller);
            } else if let Expression::Identifier(id) = it.callee.get_inner_expression()
                && let Some(callee) = symbol_of(self.scoping, id)
            {
                self.calls.push((caller, callee));
            }
        }
        walk::walk_call_expression(self, it);
    }
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
    pub(super) fn react_call(&mut self, call: &CallExpression<'_>) {
        if let Some((module, name)) = imported_call(call, self.scoping, &self.react_imports) {
            if module == "@weft-js/core" && matches!(name, "watch" | "derived" | "memo") {
                let name = name.to_string();
                self.dependency_array(call, &name);
                return;
            }
            if hook_import(module, name) && (module == "react" || !self.comps.is_empty()) {
                let name = name.to_string();
                self.react_hook(call, &name);
            }
            return;
        }
        if let Expression::Identifier(id) = call.callee.get_inner_expression()
            && !self.comps.is_empty()
            && match symbol_of(self.scoping, id) {
                Some(sym) => self.react_wrappers.contains(&sym),
                None => known_hook(id.name.as_str()),
            }
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
        let help = match name {
            "watch" => {
                "Use `watch(() => source, value => { … })`. Its second argument is a callback; \
                dependencies are tracked from the source. Omit the dependency array."
            }
            "memo" => {
                "Remove the dependency array; reads inside the callback are tracked automatically. \
                `memo` returns a callable: use `const value = memo(() => expression)` and read `value()`."
            }
            _ => {
                "Remove the dependency array; reads inside the callback are tracked automatically. \
                Read the resulting box with `.value`."
            }
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
