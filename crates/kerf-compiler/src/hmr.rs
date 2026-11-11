//! Dev-only HMR registration (PLAN §3.6, research 21). DOM output with `hmr` set, client builds only.
//!
//! Every top-level component (`function Card`, `const Card = () => …`, exported or not) is registered under
//! `file#Card` with a hash of its own source mixed with the rest of the module's, so a new module version swaps the
//! implementation in place and re-renders only the components whose hash changed (@kerf-js/core/hmr).
//!
//! A component's body-level `const x = state(init)` becomes `_$keep(state(init), "Card", "x:<hash of init>")`: an
//! edit that keeps the name and the initializer keeps the value; renaming the box or changing its initializer resets it.
//!
//! The module accepts its own updates only when every export is a component and it doesn't call `render`/`hydrate`
//! at the top level (an entry). Otherwise Vite passes the update to its importers, which re-run it.

use std::fmt::Write as _;

use oxc_allocator::{Allocator, TakeIn, Vec as ArenaVec};
use oxc_ast::ast::{
    Argument, ArrowFunctionBody, BindingPattern, Declaration, ExportDefaultDeclarationKind,
    Expression, Function, FunctionBody, Program, Statement, VariableDeclaration,
};
use oxc_ast::builder::AstBuilder;
use oxc_span::{GetSpan, SPAN, Span};

/// Wraps component state in `_$keep` and returns the footer to append to the emitted module, if any.
pub fn apply<'a>(
    allocator: &'a Allocator,
    program: &mut Program<'a>,
    source: &str,
    file: &str,
) -> Option<String> {
    let ast = AstBuilder::new(allocator);
    let text = |s: Span| {
        source
            .get(s.start as usize..s.end as usize)
            .filter(|_| s.end > 0)
            .unwrap_or("")
    };
    let mut comps: Vec<(String, u64)> = Vec::new();
    let mut rest = Fnv::new();
    let mut accept = true;
    let mut keeps = false;
    for stmt in &mut program.body {
        let span = stmt.span();
        let mixed = match &*stmt {
            // `export const Card = () => …, other = 1`
            Statement::ExportDeclaration(e) => match &e.declaration {
                Declaration::VariableDeclaration(v) => v.declarations.len(),
                _ => 0,
            },
            _ => 0,
        };
        if !exports_only_types(stmt) || calls_entry(stmt) {
            accept = false;
        }
        let found = components(stmt);
        if mixed > found.len() {
            accept = false;
        }
        if found.is_empty() {
            rest.add(text(span));
            continue;
        }
        let mut h = Fnv::new();
        h.add(text(span));
        for (name, body) in found {
            if let Some(body) = body {
                keeps |= wrap_state(&ast, allocator, body, &name, source);
            }
            comps.push((name, h.0));
        }
    }
    if comps.is_empty() {
        return None;
    }
    let rest = rest.0;
    let list: Vec<String> = comps
        .iter()
        .map(|(n, h)| format!("{n}: [{n}, \"{:x}\"]", h ^ rest))
        .collect();
    let mut out = format!(
        "\nimport {{ hot as _$hot{} }} from \"@kerf-js/core/hmr\";\n",
        if keeps { ", keep as _$keep" } else { "" }
    );
    let _ = writeln!(
        out,
        "if (import.meta.hot) {{\n\t_$hot({file:?}, {{ {} }});",
        list.join(", ")
    );
    if accept {
        out.push_str("\timport.meta.hot.accept();\n");
    }
    out.push_str("}\n");
    Some(out)
}

/// The components a top-level statement declares, with their bodies (none for an expression-bodied arrow).
fn components<'s, 'a>(
    stmt: &'s mut Statement<'a>,
) -> Vec<(String, Option<&'s mut FunctionBody<'a>>)> {
    let mut out = Vec::new();
    match stmt {
        Statement::FunctionDeclaration(f) => function(f, &mut out),
        Statement::VariableDeclaration(v) => variables(v, &mut out),
        Statement::ExportDeclaration(e) => match &mut e.declaration {
            Declaration::FunctionDeclaration(f) => function(f, &mut out),
            Declaration::VariableDeclaration(v) => variables(v, &mut out),
            _ => {}
        },
        Statement::ExportDefaultDeclaration(e) => {
            if let ExportDefaultDeclarationKind::FunctionDeclaration(f) = &mut e.declaration {
                function(f, &mut out);
            }
        }
        _ => {}
    }
    out
}

fn is_component(name: &str) -> bool {
    name.starts_with(|c: char| c.is_ascii_uppercase())
}

fn function<'s, 'a>(
    f: &'s mut Function<'a>,
    out: &mut Vec<(String, Option<&'s mut FunctionBody<'a>>)>,
) {
    if let Some(id) = &f.id
        && is_component(&id.name)
        && let Some(body) = &mut f.body
    {
        out.push((id.name.to_string(), Some(body)));
    }
}

fn variables<'s, 'a>(
    v: &'s mut VariableDeclaration<'a>,
    out: &mut Vec<(String, Option<&'s mut FunctionBody<'a>>)>,
) {
    for d in &mut v.declarations {
        let BindingPattern::BindingIdentifier(id) = &d.id else {
            continue;
        };
        if !is_component(&id.name) {
            continue;
        }
        let name = id.name.to_string();
        match d
            .init
            .as_mut()
            .map(oxc_ast::ast::Expression::get_inner_expression_mut)
        {
            Some(Expression::ArrowFunctionExpression(a)) => {
                if let ArrowFunctionBody::FunctionBody(body) = &mut a.body {
                    out.push((name, Some(body)));
                } else {
                    out.push((name, None));
                }
            }
            Some(Expression::FunctionExpression(f)) => {
                if let Some(body) = &mut f.body {
                    out.push((name, Some(body)));
                }
            }
            _ => {}
        }
    }
}

/// `const x = state(…)` at the body's top level → `const x = _$keep(state(…), "Comp", "x:<hash>")`.
fn wrap_state<'a>(
    ast: &AstBuilder<'a>,
    allocator: &'a Allocator,
    body: &mut FunctionBody<'a>,
    comp: &str,
    source: &str,
) -> bool {
    let mut any = false;
    for stmt in &mut body.statements {
        let Statement::VariableDeclaration(v) = stmt else {
            continue;
        };
        for d in &mut v.declarations {
            let BindingPattern::BindingIdentifier(id) = &d.id else {
                continue;
            };
            let Some(init) = &mut d.init else { continue };
            let Expression::CallExpression(call) = &*init else {
                continue;
            };
            if !matches!(&call.callee, Expression::Identifier(c) if c.name == "state") {
                continue;
            }
            let s = call.span;
            let mut h = Fnv::new();
            h.add(
                source
                    .get(s.start as usize..s.end as usize)
                    .filter(|_| s.end > 0)
                    .unwrap_or(""),
            );
            let key = format!("{}:{:x}", id.name, h.0);
            let inner = init.take_in(ast);
            let str =
                |v: &str| Expression::new_string_literal(SPAN, allocator.alloc_str(v), None, ast);
            let args = ArenaVec::from_iter_in(
                [inner, str(comp), str(&key)]
                    .into_iter()
                    .map(Argument::from),
                ast,
            );
            let callee = Expression::new_identifier(SPAN, "_$keep", ast);
            *init = Expression::new_call_expression(SPAN, callee, None, args, false, ast);
            any = true;
        }
    }
    any
}

/// A statement that exports nothing but components and types (`export { Card }`, `export default Card`), or isn't an
/// export. Component declarations themselves are counted by the caller.
fn exports_only_types(stmt: &Statement) -> bool {
    match stmt {
        Statement::ExportDeclaration(e) => match &e.declaration {
            Declaration::FunctionDeclaration(f) => {
                f.id.as_ref().is_some_and(|i| is_component(&i.name))
            }
            Declaration::ClassDeclaration(_) | Declaration::TSEnumDeclaration(_) => false,
            _ => true, // types, and variables: those are counted against the components found in them
        },
        Statement::ExportNamedDeclaration(e) => {
            e.export_kind.is_type()
                || e.specifiers
                    .iter()
                    .all(|s| s.export_kind.is_type() || is_component(&s.local.name()))
        }
        Statement::ExportDefaultDeclaration(e) => match &e.declaration {
            ExportDefaultDeclarationKind::FunctionDeclaration(f) => {
                f.id.as_ref().is_some_and(|i| is_component(&i.name))
            }
            ExportDefaultDeclarationKind::TSInterfaceDeclaration(_) => true,
            ExportDefaultDeclarationKind::Identifier(i) => is_component(&i.name),
            _ => false,
        },
        Statement::ExportAllDeclaration(_)
        | Statement::ExportFromDeclaration(_)
        | Statement::TSExportAssignment(_) => false,
        _ => true,
    }
}

/// A top-level `render(…)` or `hydrate(…)`: the app's entry, which re-running would mount twice.
fn calls_entry(stmt: &Statement) -> bool {
    let entry = |e: &Expression| {
        let mut e = e.get_inner_expression();
        if let Expression::AwaitExpression(a) = e {
            e = a.argument.get_inner_expression();
        }
        matches!(e, Expression::CallExpression(c) if matches!(&c.callee, Expression::Identifier(i) if i.name == "render" || i.name == "hydrate"))
    };
    match stmt {
        Statement::ExpressionStatement(e) => entry(&e.expression),
        Statement::VariableDeclaration(v) => v
            .declarations
            .iter()
            .any(|d| d.init.as_ref().is_some_and(entry)),
        _ => false,
    }
}

/// FNV-1a, 64-bit: stable across runs and platforms (Rust's default hasher is seeded).
struct Fnv(u64);

impl Fnv {
    fn new() -> Self {
        Self(0xcbf2_9ce4_8422_2325)
    }
    fn add(&mut self, s: &str) {
        for b in s.bytes() {
            self.0 = (self.0 ^ u64::from(b)).wrapping_mul(0x0100_0000_01b3);
        }
    }
}

/// Dev names for the reactive graph (`kerf browser snapshot`, the dev overlay; research 22). Body-level
/// `const x = state(…)`, `derived(…)` and `state.linked(…)` in a component become `_$name(…, "Card.x")`; top-level ones
/// in any module `_$name(…, "<file stem>.x")`. Returns the import to append, if anything was named.
pub fn names<'a>(
    allocator: &'a Allocator,
    program: &mut Program<'a>,
    file: &str,
) -> Option<String> {
    let ast = AstBuilder::new(allocator);
    let stem = std::path::Path::new(file)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("module")
        .to_string();
    let mut any = false;
    for stmt in &mut program.body {
        if let Statement::VariableDeclaration(v) = &mut *stmt {
            any |= name_decls(&ast, allocator, v, &stem);
        } else if let Statement::ExportDeclaration(e) = &mut *stmt
            && let Declaration::VariableDeclaration(v) = &mut e.declaration
        {
            any |= name_decls(&ast, allocator, v, &stem);
        }
        for (comp, body) in components(stmt) {
            let Some(body) = body else { continue };
            for s in &mut body.statements {
                if let Statement::VariableDeclaration(v) = s {
                    any |= name_decls(&ast, allocator, v, &comp);
                }
            }
        }
    }
    any.then(|| "\nimport { name as _$name } from \"@kerf-js/core\";\n".to_string())
}

fn name_decls<'a>(
    ast: &AstBuilder<'a>,
    allocator: &'a Allocator,
    v: &mut VariableDeclaration<'a>,
    owner: &str,
) -> bool {
    let mut any = false;
    for d in &mut v.declarations {
        let BindingPattern::BindingIdentifier(id) = &d.id else {
            continue;
        };
        let Some(init) = &mut d.init else { continue };
        if !reactive_init(init) {
            continue;
        }
        let label = format!("{owner}.{}", id.name);
        let inner = init.take_in(ast);
        let str = Expression::new_string_literal(SPAN, allocator.alloc_str(&label), None, ast);
        let args = ArenaVec::from_iter_in([inner, str].into_iter().map(Argument::from), ast);
        *init = Expression::new_call_expression(
            SPAN,
            Expression::new_identifier(SPAN, "_$name", ast),
            None,
            args,
            false,
            ast,
        );
        any = true;
    }
    any
}

/// `state(…)`, `derived(…)`, `state.linked(…)`, or one already wrapped by `_$keep` (HMR).
fn reactive_init(e: &Expression) -> bool {
    let Expression::CallExpression(call) = e else {
        return false;
    };
    match &call.callee {
        Expression::Identifier(c) if c.name == "state" || c.name == "derived" => true,
        Expression::Identifier(c) if c.name == "_$keep" => true,
        Expression::StaticMemberExpression(m) => {
            matches!(&m.object, Expression::Identifier(o) if o.name == "state")
                && m.property.name == "linked"
        }
        _ => false,
    }
}
