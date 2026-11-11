//! Style groups (research 23 §2.5), spike. A `group('order-card', { … })` from `@kerf/core/style` is data: it is evaluated
//! here, at build (W060 names the first value that isn't a literal), and reported in `facts.groups`. Call sites lower
//! to plain attributes, which the back end already compiles to static template HTML and one binding per reactive
//! value:
//!
//! | Authored | Lowered |
//! |---|---|
//! | `{...orderCard({ status: s, selected })}` | `data-g="order-card" data-status={s} aria-selected={selected ? "true" : "false"}` |
//! | `{...orderCard({ status: 'late' })}`      | `data-g="order-card" data-status="late"` (static) |
//! | `{...orderCard()}`                        | `data-g="order-card"` plus each axis default, static |
//! | `{...orderCard.title}`                    | `data-part="title"` (`tagged_parts`: `data-g="order-card" data-part="title"`) |
//!
//! Each lowered site goes to `facts.groupUses` with the axis values it can produce (a literal, the literal leaves of
//! a conditional, or any), and the Vite plugin emits CSS for exactly those. Unknown axes, values, states and parts are
//! D025 errors, with the closest names; two group roots on one element are D024. Groups defined in other modules
//! arrive through `options.groups`. A site whose argument isn't an object literal stays a runtime spread of
//! `group()`'s result, and its use is reported as dynamic.
//!
//! An accent (`card({ status: 'late', accent: { radius: 'round' } })`, research 23 §2.2) is token-only and literal. It
//! lowers to one static attribute, `data-accent="radius:round"`, so it stays visible in the markup, and the Vite plugin
//! emits a rule for each accent some site uses. Intents and tokens are checked against the vocabulary there.

mod lower;
mod values;
mod visitor;

use std::collections::{BTreeMap, HashMap, HashSet};

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    Argument, BindingPattern, Declaration, Expression, ImportDeclarationSpecifier, Program,
    Statement,
};
use oxc_ast::builder::AstBuilder;
use oxc_ast_visit::VisitMut;
use oxc_semantic::{Scoping, SymbolId};
use oxc_span::GetSpan;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::diag::{Diagnostic, line_col};
pub(crate) use values::resolve;
use values::{doc_before, eval, not_static, resolves};

/// A `group()` defined in this file.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupDef {
    pub binding: String,
    pub exported: bool,
    pub name: String,
    pub def: Value,
    pub line: u32,
    /// The `/** … */` comment right above the definition, without its markers.
    pub doc: Option<String>,
}

/// One call site of a group.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupUse {
    pub group: String,
    /// Axis → the values this site can produce; `None`: any value of the axis.
    pub axes: BTreeMap<String, Option<Vec<String>>>,
    pub states: Vec<String>,
    pub part: Option<String>,
    /// The argument isn't an object literal, so the site can produce any value of any axis (a runtime spread).
    pub dynamic: bool,
    /// The site's accent, intent → token (`{ radius: 'round' }`).
    pub accent: Option<BTreeMap<String, String>>,
    pub line: u32,
}

/// A group from another module, as `options.groups` passes it, keyed `"<absolute path without extension>#<export>"`.
#[derive(Clone, Debug, Deserialize)]
pub struct Imported {
    pub name: String,
    pub def: Value,
}

/// ARIA states a group writes as `aria-*`. Other states are `data-*`; pseudo states are read, never written.
const ARIA: &[&str] = &[
    "selected", "pressed", "checked", "expanded", "current", "invalid", "busy",
];
const PSEUDO: &[&str] = &["hover", "focus", "active", "disabled"];

type Axes = Vec<(String, Vec<String>)>;

struct Meta {
    name: String,
    axes: Axes,
    inherit: Vec<String>,
    states: Vec<String>,
    parts: Vec<String>,
    defaults: Vec<(String, String)>,
}

fn keys(v: Option<&Value>) -> Vec<String> {
    v.and_then(Value::as_object)
        .map(|o| o.keys().cloned().collect())
        .unwrap_or_default()
}

fn meta(name: &str, def: &Value) -> Meta {
    let mut axes = Vec::new();
    let mut inherit = Vec::new();
    for (axis, values) in def
        .get("axes")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
    {
        match values {
            Value::String(s) if s == "inherit" => inherit.push(axis.clone()),
            _ => axes.push((axis.clone(), keys(Some(values)))),
        }
    }
    let defaults = def
        .get("defaults")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .filter_map(|(k, v)| {
            Some((
                k.clone(),
                v.as_str()
                    .map(str::to_string)
                    .or_else(|| v.as_bool().map(|b| b.to_string()))?,
            ))
        })
        .collect();
    Meta {
        name: name.to_string(),
        axes,
        inherit,
        states: keys(def.get("states")),
        parts: keys(def.get("parts")),
        defaults,
    }
}

fn state_attr(state: &str) -> String {
    if ARIA.contains(&state) {
        format!("aria-{state}")
    } else {
        format!("data-{state}")
    }
}

pub fn apply<'a>(
    allocator: &'a Allocator,
    program: &mut Program<'a>,
    scoping: &Scoping,
    source: &str,
    options: &crate::Options,
    diagnostics: &mut Vec<Diagnostic>,
) -> (Vec<GroupDef>, Vec<GroupUse>) {
    let (filename, imported, tagged_parts) = (
        options.filename.as_str(),
        &options.groups,
        options.tagged_parts,
    );
    let mut group_fn = None;
    let mut metas: HashMap<SymbolId, Meta> = HashMap::new();
    for stmt in &program.body {
        let Statement::ImportDeclaration(d) = stmt else {
            continue;
        };
        let from = d.source.value.as_str();
        for spec in d.specifiers.iter().flatten() {
            let ImportDeclarationSpecifier::ImportSpecifier(s) = spec else {
                continue;
            };
            let Some(sym) = s.local.symbol_id.get() else {
                continue;
            };
            if from == "@kerf/core/style" && s.imported.name() == "group" {
                group_fn = Some(sym);
            } else if from.starts_with('.') {
                let key = format!("{}#{}", resolve(filename, from), s.imported.name());
                if let Some(g) = imported.get(&key) {
                    metas.insert(sym, meta(&g.name, &g.def));
                }
            }
        }
    }
    if group_fn.is_none() && metas.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let (defs, handled) = definitions(program, scoping, source, group_fn, &mut metas, diagnostics);

    let mut lower = Lower {
        allocator,
        ast: AstBuilder::new(allocator),
        scoping,
        source,
        metas,
        group_fn,
        handled,
        tagged_parts,
        diagnostics,
        uses: Vec::new(),
    };
    lower.visit_program(program);
    (defs, lower.uses)
}

fn definitions(
    program: &mut Program<'_>,
    scoping: &Scoping,
    source: &str,
    group_fn: Option<SymbolId>,
    metas: &mut HashMap<SymbolId, Meta>,
    diagnostics: &mut Vec<Diagnostic>,
) -> (Vec<GroupDef>, HashSet<u32>) {
    // Definitions: `const x = group('name', { … })` at the top level, exported or not.
    let mut defs = Vec::new();
    let mut handled = HashSet::new();
    for stmt in &mut program.body {
        let start = stmt.span().start;
        let (decl, exported) = match stmt {
            Statement::VariableDeclaration(d) => (d, false),
            Statement::ExportDeclaration(e) => match &mut e.declaration {
                Declaration::VariableDeclaration(d) => (d, true),
                _ => continue,
            },
            _ => continue,
        };
        for d in &mut decl.declarations {
            let (BindingPattern::BindingIdentifier(id), Some(Expression::CallExpression(call))) =
                (&d.id, &mut d.init)
            else {
                continue;
            };
            if resolves(scoping, &call.callee) != group_fn || group_fn.is_none() {
                continue;
            }
            handled.insert(call.span.start);
            call.pure = true;
            let name = match call.arguments.first().and_then(Argument::as_expression) {
                Some(Expression::StringLiteral(s)) => s.value.to_string(),
                other => {
                    let span = other.map_or(call.span, GetSpan::span);
                    diagnostics.push(not_static(
                        source,
                        span,
                        "the group's name",
                        "Name the group with a string literal: group('order-card', { … }).",
                    ));
                    continue;
                }
            };
            let def = match call.arguments.get(1).and_then(Argument::as_expression) {
                None => Value::Object(Map::new()),
                Some(e) => match eval(e) {
                    Ok(v) => v,
                    Err((span, path)) => {
                        let what = format!(
                            "`{}` at {name}.{path}",
                            &source[span.start as usize..span.end as usize]
                        );
                        diagnostics.push(not_static(source, span, &what, "Group values are token names and literals, evaluated at build. Inline the value, or use `css: { … }` for a raw one."));
                        continue;
                    }
                },
            };
            let line = line_col(source, call.span.start).0;
            if let Some(sym) = id.symbol_id.get() {
                metas.insert(sym, meta(&name, &def));
            }
            defs.push(GroupDef {
                binding: id.name.to_string(),
                exported,
                name,
                def,
                line,
                doc: doc_before(source, start),
            });
        }
    }

    (defs, handled)
}

struct Lower<'a, 'p> {
    allocator: &'a Allocator,
    ast: AstBuilder<'a>,
    scoping: &'p Scoping,
    source: &'p str,
    metas: HashMap<SymbolId, Meta>,
    group_fn: Option<SymbolId>,
    /// `group()` calls that are definitions (any other `group()` call is W060).
    handled: HashSet<u32>,
    tagged_parts: bool,
    diagnostics: &'p mut Vec<Diagnostic>,
    uses: Vec<GroupUse>,
}
