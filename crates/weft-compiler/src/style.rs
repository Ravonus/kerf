//! Style groups (research 23 §2.5), spike. A `group('order-card', { … })` from `weft/style` is data: it is evaluated
//! here, at build (W060 names the first value that isn't a literal), and reported in `facts.groups`. Call sites lower
//! to plain attributes, which the back end already compiles to static template HTML and one binding per reactive
//! value:
//!
//! | Authored | Lowered |
//! |---|---|
//! | `{...orderCard({ status: s, selected })}` | `data-g="order-card" data-status={s} aria-selected={selected ? "true" : "false"}` |
//! | `{...orderCard({ status: 'late' })}`      | `data-g="order-card" data-status="late"` (static) |
//! | `{...orderCard()}`                        | `data-g="order-card"` plus each axis default, static |
//! | `{...orderCard.title}`                    | `data-g="order-card" data-part="title"` |
//!
//! Each lowered site goes to `facts.groupUses` with the axis values it can produce (a literal, the literal leaves of
//! a conditional, or any), and the Vite plugin emits CSS for exactly those. Unknown axes, values, states and parts are
//! W061 errors. Groups defined in other modules arrive through `options.groups`. A site whose argument isn't an
//! object literal stays a runtime spread of `group()`'s result, and its use is reported as dynamic.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Component, Path, PathBuf};

use oxc_allocator::{Allocator, TakeIn, Vec as ArenaVec};
use oxc_ast::ast::*;
use oxc_ast::builder::AstBuilder;
use oxc_ast_visit::{VisitMut, walk_mut};
use oxc_semantic::{Scoping, SymbolId};
use oxc_span::{GetSpan, SPAN, Span};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::diag::{Diagnostic, Severity, line_col};

/// A `group()` defined in this file.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupDef {
    pub binding: String,
    pub exported: bool,
    pub name: String,
    pub def: Value,
    pub line: u32,
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
    pub line: u32,
}

/// A group from another module, as `options.groups` passes it, keyed `"<absolute path without extension>#<export>"`.
#[derive(Clone, Debug, Deserialize)]
pub struct Imported {
    pub name: String,
    pub def: Value,
}

/// ARIA states a group writes as `aria-*`. Other states are `data-*`; pseudo states are read, never written.
const ARIA: &[&str] = &["selected", "pressed", "checked", "expanded", "current", "invalid", "busy"];
const PSEUDO: &[&str] = &["hover", "focus", "active", "disabled"];

struct Meta {
    name: String,
    axes: Vec<(String, Vec<String>)>,
    inherit: Vec<String>,
    states: Vec<String>,
    parts: Vec<String>,
    defaults: Vec<(String, String)>,
}

fn keys(v: Option<&Value>) -> Vec<String> {
    v.and_then(Value::as_object).map(|o| o.keys().cloned().collect()).unwrap_or_default()
}

fn meta(name: &str, def: &Value) -> Meta {
    let mut axes = Vec::new();
    let mut inherit = Vec::new();
    for (axis, values) in def.get("axes").and_then(Value::as_object).into_iter().flatten() {
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
        .filter_map(|(k, v)| Some((k.clone(), v.as_str().map(str::to_string).or_else(|| v.as_bool().map(|b| b.to_string()))?)))
        .collect();
    Meta { name: name.to_string(), axes, inherit, states: keys(def.get("states")), parts: keys(def.get("parts")), defaults }
}

fn state_attr(state: &str) -> String {
    if ARIA.contains(&state) { format!("aria-{state}") } else { format!("data-{state}") }
}

pub fn apply<'a>(
    allocator: &'a Allocator,
    program: &mut Program<'a>,
    scoping: &Scoping,
    source: &str,
    filename: &str,
    imported: &HashMap<String, Imported>,
    diagnostics: &mut Vec<Diagnostic>,
) -> (Vec<GroupDef>, Vec<GroupUse>) {
    let mut group_fn = None;
    let mut metas: HashMap<SymbolId, Meta> = HashMap::new();
    for stmt in &program.body {
        let Statement::ImportDeclaration(d) = stmt else { continue };
        let from = d.source.value.as_str();
        for spec in d.specifiers.iter().flatten() {
            let ImportDeclarationSpecifier::ImportSpecifier(s) = spec else { continue };
            let Some(sym) = s.local.symbol_id.get() else { continue };
            if from == "weft/style" && s.imported.name() == "group" {
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

    // Definitions: `const x = group('name', { … })` at the top level, exported or not.
    let mut defs = Vec::new();
    let mut handled = HashSet::new();
    for stmt in program.body.iter_mut() {
        let (decl, exported) = match stmt {
            Statement::VariableDeclaration(d) => (d, false),
            Statement::ExportDeclaration(e) => match &mut e.declaration {
                Declaration::VariableDeclaration(d) => (d, true),
                _ => continue,
            },
            _ => continue,
        };
        for d in decl.declarations.iter_mut() {
            let (BindingPattern::BindingIdentifier(id), Some(Expression::CallExpression(call))) = (&d.id, &mut d.init) else { continue };
            if resolves(scoping, &call.callee) != group_fn || group_fn.is_none() {
                continue;
            }
            handled.insert(call.span.start);
            call.pure = true;
            let name = match call.arguments.first().and_then(Argument::as_expression) {
                Some(Expression::StringLiteral(s)) => s.value.to_string(),
                other => {
                    let span = other.map_or(call.span, GetSpan::span);
                    diagnostics.push(not_static(source, span, "the group's name", "Name the group with a string literal: group('order-card', { … })."));
                    continue;
                }
            };
            let def = match call.arguments.get(1).and_then(Argument::as_expression) {
                None => Value::Object(Map::new()),
                Some(e) => match eval(e) {
                    Ok(v) => v,
                    Err((span, path)) => {
                        let what = format!("`{}` at {name}.{path}", &source[span.start as usize..span.end as usize]);
                        diagnostics.push(not_static(source, span, &what, "Group values are token names and literals, evaluated at build. Inline the value, or use `css: { … }` for a raw one."));
                        continue;
                    }
                },
            };
            let line = line_col(source, call.span.start).0;
            if let Some(sym) = id.symbol_id.get() {
                metas.insert(sym, meta(&name, &def));
            }
            defs.push(GroupDef { binding: id.name.to_string(), exported, name, def, line });
        }
    }

    let mut lower = Lower { allocator, ast: AstBuilder::new(allocator), scoping, source, metas, group_fn, handled, diagnostics, uses: Vec::new() };
    lower.visit_program(program);
    (defs, lower.uses)
}

fn not_static(source: &str, span: Span, what: &str, help: &str) -> Diagnostic {
    Diagnostic::new(source, "W060", Severity::Error, (span.start, span.end), format!("group can't be evaluated at build: {what} isn't a literal"), help)
}

fn resolves(scoping: &Scoping, e: &Expression) -> Option<SymbolId> {
    let Expression::Identifier(id) = e else { return None };
    id.reference_id.get().and_then(|r| scoping.get_reference(r).symbol_id())
}

/// `./order-card` from `/app/src/x.tsx` → `/app/src/order-card` (extension stripped, as the plugin keys groups).
fn resolve(filename: &str, spec: &str) -> String {
    let base = Path::new(filename).parent().unwrap_or(Path::new("")).join(spec);
    let mut out = PathBuf::new();
    for c in base.components() {
        match c {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            c => out.push(c),
        }
    }
    let s = out.to_string_lossy().into_owned();
    for ext in [".tsx", ".ts", ".jsx", ".js", ".mts", ".mjs"] {
        if let Some(stem) = s.strip_suffix(ext) {
            return stem.to_string();
        }
    }
    s
}

/// A literal value: strings, numbers, booleans, null, objects with plain keys, arrays. `Err` is the first value that
/// isn't one, with its path in the definition.
fn eval(e: &Expression) -> Result<Value, (Span, String)> {
    match e {
        Expression::StringLiteral(s) => Ok(Value::String(s.value.to_string())),
        Expression::NumericLiteral(n) => Ok(serde_json::Number::from_f64(n.value).map_or(Value::Null, Value::Number)),
        Expression::BooleanLiteral(b) => Ok(Value::Bool(b.value)),
        Expression::NullLiteral(_) => Ok(Value::Null),
        Expression::TemplateLiteral(t) if t.expressions.is_empty() => {
            Ok(Value::String(t.quasis.iter().map(|q| q.value.cooked.map_or(q.value.raw.as_str(), |c| c.as_str())).collect()))
        }
        Expression::ParenthesizedExpression(p) => eval(&p.expression),
        Expression::TSAsExpression(a) => eval(&a.expression),
        Expression::TSSatisfiesExpression(a) => eval(&a.expression),
        Expression::UnaryExpression(u) if u.operator.as_str() == "-" => match eval(&u.argument)? {
            Value::Number(n) => Ok(serde_json::Number::from_f64(-n.as_f64().unwrap_or(0.0)).map_or(Value::Null, Value::Number)),
            _ => Err((u.span, String::new())),
        },
        Expression::ArrayExpression(a) => a
            .elements
            .iter()
            .enumerate()
            .map(|(i, el)| match el.as_expression() {
                Some(e) => eval(e).map_err(|(s, p)| (s, join(&i.to_string(), &p))),
                None => Err((a.span, i.to_string())),
            })
            .collect::<Result<Vec<_>, _>>()
            .map(Value::Array),
        Expression::ObjectExpression(o) => {
            let mut map = Map::new();
            for p in &o.properties {
                let ObjectPropertyKind::ObjectProperty(p) = p else { return Err((p.span(), String::new())) };
                let key = match &p.key {
                    PropertyKey::StaticIdentifier(id) => id.name.to_string(),
                    PropertyKey::StringLiteral(s) => s.value.to_string(),
                    PropertyKey::NumericLiteral(n) => n.value.to_string(),
                    k => return Err((k.span(), String::new())),
                };
                if p.computed || p.method || p.kind != PropertyKind::Init {
                    return Err((p.span, key));
                }
                let v = eval(&p.value).map_err(|(s, path)| (s, join(&key, &path)))?;
                map.insert(key, v);
            }
            Ok(Value::Object(map))
        }
        e => Err((e.span(), String::new())),
    }
}

fn join(head: &str, tail: &str) -> String {
    if tail.is_empty() { head.to_string() } else { format!("{head}.{tail}") }
}

/// The values an axis expression can produce, when every leaf is a string literal (`a ? 'x' : 'y'`).
fn literals(e: &Expression) -> Option<Vec<String>> {
    match e {
        Expression::StringLiteral(s) => Some(vec![s.value.to_string()]),
        Expression::TemplateLiteral(t) if t.expressions.is_empty() => Some(vec![t.quasis[0].value.raw.to_string()]),
        Expression::ParenthesizedExpression(p) => literals(&p.expression),
        Expression::TSAsExpression(a) => literals(&a.expression),
        Expression::ConditionalExpression(c) => {
            let mut v = literals(&c.consequent)?;
            v.extend(literals(&c.alternate)?);
            v.dedup();
            Some(v)
        }
        _ => None,
    }
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
    diagnostics: &'p mut Vec<Diagnostic>,
    uses: Vec<GroupUse>,
}

impl<'a> Lower<'a, '_> {
    fn attr(&self, name: &str, value: JSXAttributeValue<'a>) -> JSXAttributeItem<'a> {
        let name = JSXAttributeName::new_identifier(SPAN, self.allocator.alloc_str(name), &self.ast);
        JSXAttributeItem::new_attribute(SPAN, name, Some(value), &self.ast)
    }

    fn text(&self, name: &str, value: &str) -> JSXAttributeItem<'a> {
        self.attr(name, JSXAttributeValue::new_string_literal(SPAN, self.allocator.alloc_str(value), None, &self.ast))
    }

    fn expr(&self, name: &str, e: Expression<'a>) -> JSXAttributeItem<'a> {
        self.attr(name, JSXAttributeValue::new_expression_container(SPAN, JSXExpression::from(e), &self.ast))
    }

    fn string(&self, value: &str) -> Expression<'a> {
        Expression::new_string_literal(SPAN, self.allocator.alloc_str(value), None, &self.ast)
    }

    fn error(&mut self, span: Span, message: String, help: String) {
        self.diagnostics.push(Diagnostic::new(self.source, "W061", Severity::Error, (span.start, span.end), message, help));
    }

    fn meta_of(&self, e: &Expression) -> Option<&Meta> {
        resolves(self.scoping, e).and_then(|s| self.metas.get(&s))
    }

    /// The attributes a group spread lowers to, or `None` to leave it a runtime spread.
    fn lower(&mut self, arg: &mut Expression<'a>, line: u32) -> Option<Vec<JSXAttributeItem<'a>>> {
        if let Expression::StaticMemberExpression(m) = arg {
            let meta = self.meta_of(&m.object)?;
            let (name, part) = (meta.name.clone(), m.property.name.to_string());
            if !meta.parts.contains(&part) {
                let help = format!("Parts of {name}: {}.", list(&meta.parts));
                self.error(m.property.span, format!("group {name} has no part `{part}`"), help);
                return None;
            }
            self.uses.push(GroupUse { group: name.clone(), axes: BTreeMap::new(), states: Vec::new(), part: Some(part.clone()), dynamic: false, line });
            return Some(vec![self.text("data-g", &name), self.text("data-part", &part)]);
        }
        let Expression::CallExpression(call) = arg else { return None };
        let meta = self.meta_of(&call.callee)?;
        let name = meta.name.clone();
        let axes = meta.axes.clone();
        let (inherit, states, defaults) = (meta.inherit.clone(), meta.states.clone(), meta.defaults.clone());
        let mut use_ = GroupUse { group: name.clone(), axes: BTreeMap::new(), states: Vec::new(), part: None, dynamic: false, line };
        let props = match call.arguments.first_mut() {
            None => None,
            Some(Argument::ObjectExpression(o)) if o.properties.iter().all(|p| matches!(p, ObjectPropertyKind::ObjectProperty(p) if !p.computed)) => Some(o),
            Some(_) => {
                use_.dynamic = true;
                self.uses.push(use_);
                return None;
            }
        };
        let mut out = vec![self.text("data-g", &name)];
        for p in props.into_iter().flat_map(|o| o.properties.iter_mut()) {
            let ObjectPropertyKind::ObjectProperty(p) = p else { continue };
            let Some(key) = p.key.static_name().map(|k| k.to_string()) else { continue };
            if let Some((_, values)) = axes.iter().find(|(a, _)| *a == key) {
                let produced = literals(&p.value);
                for v in produced.iter().flatten() {
                    if !values.contains(v) {
                        let help = format!("Values of {name}.{key}: {}.", list(values));
                        self.error(p.value.span(), format!("`{v}` isn't a value of {name}'s `{key}` axis"), help);
                    }
                }
                let attr = format!("data-{key}");
                out.push(match &p.value {
                    Expression::StringLiteral(s) => self.text(&attr, &s.value),
                    _ => self.expr(&attr, p.value.take_in(&self.ast)),
                });
                use_.axes.insert(key, produced);
            } else if states.contains(&key) && !PSEUDO.contains(&key.as_str()) {
                // ARIA states are "true"/"false" on the server and the client alike; other states are present or not.
                let aria = ARIA.contains(&key.as_str());
                let attr = state_attr(&key);
                match &p.value {
                    Expression::BooleanLiteral(b) if aria => out.push(self.text(&attr, if b.value { "true" } else { "false" })),
                    Expression::BooleanLiteral(b) if b.value => out.push(self.text(&attr, "")),
                    Expression::BooleanLiteral(_) => {}
                    _ => {
                        let test = p.value.take_in(&self.ast);
                        let (yes, no) = if aria {
                            (self.string("true"), self.string("false"))
                        } else {
                            (self.string(""), Expression::new_null_literal(SPAN, &self.ast))
                        };
                        out.push(self.expr(&attr, Expression::new_conditional_expression(SPAN, test, yes, no, &self.ast)));
                    }
                }
                use_.states.push(key);
            } else {
                let (message, help) = if PSEUDO.contains(&key.as_str()) && states.contains(&key) {
                    (format!("`{key}` is read from the element (:{key}), not passed"), "Drop it from the call; the group's `states` style it.".to_string())
                } else if inherit.contains(&key) {
                    (format!("{name}'s `{key}` axis is inherited from the nearest surface"), "Set it on an ancestor, not here.".to_string())
                } else {
                    let ax: Vec<String> = axes.iter().map(|(a, _)| a.clone()).collect();
                    (format!("group {name} has no axis or state `{key}`"), format!("Axes: {}. States: {}.", list(&ax), list(&states)))
                };
                self.error(p.key.span(), message, help);
            }
        }
        for (axis, value) in defaults {
            if !use_.axes.contains_key(&axis) && axes.iter().any(|(a, _)| *a == axis) {
                out.push(self.text(&format!("data-{axis}"), &value));
                use_.axes.insert(axis, Some(vec![value]));
            }
        }
        self.uses.push(use_);
        Some(out)
    }
}

fn list(xs: &[String]) -> String {
    if xs.is_empty() { "none".into() } else { xs.join(", ") }
}

impl<'a> VisitMut<'a> for Lower<'a, '_> {
    fn visit_jsx_opening_element(&mut self, it: &mut JSXOpeningElement<'a>) {
        let is_group = |a: &JSXAttributeItem, me: &Self| match a {
            JSXAttributeItem::SpreadAttribute(s) => match &s.argument {
                Expression::StaticMemberExpression(m) => me.meta_of(&m.object).is_some(),
                Expression::CallExpression(c) => me.meta_of(&c.callee).is_some(),
                _ => false,
            },
            _ => false,
        };
        if it.attributes.iter().any(|a| is_group(a, self)) {
            let old = std::mem::replace(&mut it.attributes, ArenaVec::new_in(&self.ast));
            for mut item in old {
                if is_group(&item, self)
                    && let JSXAttributeItem::SpreadAttribute(s) = &mut item
                {
                    let line = line_col(self.source, s.span.start).0;
                    if let Some(attrs) = self.lower(&mut s.argument, line) {
                        it.attributes.extend(attrs);
                        continue;
                    }
                }
                it.attributes.push(item);
            }
        }
        walk_mut::walk_jsx_opening_element(self, it);
    }

    fn visit_call_expression(&mut self, it: &mut CallExpression<'a>) {
        if self.group_fn.is_some() && resolves(self.scoping, &it.callee) == self.group_fn && !self.handled.contains(&it.span.start) {
            self.diagnostics.push(not_static(
                self.source,
                it.span,
                "a group() call outside a top-level `const`",
                "Define groups as `export const name = group('name', { … })` at the top of a module.",
            ));
        }
        walk_mut::walk_call_expression(self, it);
    }
}
