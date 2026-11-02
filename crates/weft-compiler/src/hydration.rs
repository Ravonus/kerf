//! Partial hydration (PLAN §11). One read of a file for the project's view, and two small edits once that view has
//! decided which component call sites are islands.
//!
//! `facts` lists each top-level binding: why it needs the client by itself (a handler, a `ref`, a top-level side
//! effect), which top-level bindings it reads, and its component call sites with each prop's kind. It says nothing
//! about reactivity by name: a box can only reach a function through a binding that made one, or from a caller that
//! holds one, so the reads are enough (`weft/node/hydration.mjs` follows them across files).
//!
//! Call sites are numbered in source order. For a site the project made an island:
//!
//! | Output | What it gets |
//! |---|---|
//! | SSR | `<T _$i="id|a,b|s|w">`: `emit` wraps the component in `_$island`, sending props `a` and `b` as JSON; `w` is when it loads |
//! | DOM | `export const $iN = (_p) => <T …/>` appended to the source, so every pass treats it as authored code |
//!
//! A prop that is a literal or reads only module-level names is client code (`$iN` keeps its text); any other is a
//! server value (`_p.v[k]`). A prop that holds a function over local names can't be either, so the caller stays on the
//! client. Children that are plain markup stay the server's (`_p.s`, the slot), and children that need the client are
//! kept in `$iN` as written.
//!
//! When an island may load is the project's call too, so `facts` also says what could make waiting wrong: the globals a
//! binding touches outside handlers (`window.x` counts as `x`), the methods that move focus or scroll, what it calls while
//! rendering, and `early`, what must run with the page (`autofocus`, a `ref` callback that does more than keep the node).

use std::collections::HashMap;

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    ArrowFunctionExpression, BindingPattern, CallExpression, Declaration, ExportDefaultDeclarationKind, Expression,
    Function, IdentifierReference, ImportDeclarationSpecifier, JSXAttribute, JSXAttributeItem, JSXAttributeName,
    JSXAttributeValue, JSXChild, JSXElement, JSXElementName, JSXFragment, JSXMemberExpressionObject,
    ObjectPropertyKind, Program, Statement, StaticMemberExpression, TSType, VariableDeclarator,
};
use oxc_ast_visit::{Visit, VisitMut, walk, walk_mut};
use oxc_parser::Parser;
use oxc_semantic::{Scoping, SemanticBuilder};
use oxc_span::{GetSpan, SPAN, SourceType, Span};
use serde::{Deserialize, Serialize};

use crate::diag::line_col;

/// The attribute the marking adds to an island's tag: `id|prop,prop|s|when`.
pub const ISLAND: &str = "_$i";

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HydrationFacts {
    pub nodes: Vec<Node>,
    pub imports: Vec<Import>,
    pub exports: Vec<Export>,
    /// `export * from "…"`.
    pub stars: Vec<String>,
    /// What this module does as it loads (a client that skips the module would skip it).
    pub effects: Option<String>,
    /// Modules it imports only to run them: an effect if they have one, which the project's view can tell.
    pub side: Vec<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub name: String,
    pub line: u32,
    /// Why this binding needs the client, on its own.
    pub own: Option<String>,
    /// The `@weft client` / `@weft static` / `@weft visible` comment above it.
    pub force: Option<String>,
    pub uses: Vec<String>,
    pub sites: Vec<Site>,
    /// A variable holding a value, not a function: what it holds is shared by everything that reads it.
    pub value: bool,
    /// Why this can't wait for the page to settle.
    pub early: Option<String>,
    /// Globals and page-moving methods (`.focus`) touched outside handlers.
    pub globals: Vec<String>,
    /// Module-level names called outside handlers.
    pub calls: Vec<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Site {
    pub index: u32,
    pub line: u32,
    /// The tag's module-level name; empty when it's a local value (`<props.icon />`).
    pub tag: String,
    /// `<ns.Tag />`: `Tag`.
    pub member: Option<String>,
    /// The tag gets a handler or `ref`, so this site needs the client whatever the tag is.
    pub handler: bool,
    pub attrs: Vec<Attr>,
    pub kids: Kids,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attr {
    pub name: String,
    /// `lit`, `closed` (module-level names only), `value` (the server sends it), `closure` (a function over local
    /// names) or `spread`.
    pub kind: String,
    pub uses: Vec<String>,
    pub own: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Kids {
    pub present: bool,
    /// Reads only module-level names, so `$iN` can hold them.
    pub closed: bool,
    /// A function child, or something in them needing the client by itself.
    pub own: Option<String>,
    pub uses: Vec<String>,
    /// The call sites inside.
    pub sites: Vec<u32>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Import {
    pub local: String,
    pub source: String,
    /// `default`, `*` or the export's name.
    pub imported: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Export {
    pub exported: String,
    pub local: Option<String>,
    /// `export { a as b } from "…"`.
    pub source: Option<String>,
    pub imported: Option<String>,
}

/// One site the project made an island (`Options::islands`).
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IslandSite {
    pub index: u32,
    /// Keep the children in `$iN`; otherwise they are the server's.
    pub hoist: bool,
    /// `v` (when visible) or `i` (on interaction). Empty: with the page.
    #[serde(default)]
    pub when: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Islands {
    /// The file's project-relative path: an island's id is `<id>#<site>`.
    pub id: String,
    pub sites: Vec<IslandSite>,
}

fn component_tag(name: &JSXElementName<'_>) -> bool {
    matches!(name, JSXElementName::IdentifierReference(_) | JSXElementName::MemberExpression(_))
        || matches!(name, JSXElementName::Identifier(n) if n.name.starts_with(|c: char| c.is_ascii_uppercase()))
}

fn is_handler(name: &str) -> bool {
    name == "ref" || (name.starts_with("on") && name[2..].starts_with(|c: char| c.is_ascii_uppercase()))
}

fn attr_name(a: &JSXAttribute<'_>) -> String {
    match &a.name {
        JSXAttributeName::Identifier(id) => id.name.to_string(),
        JSXAttributeName::NamespacedName(n) => format!("{}:{}", n.namespace.name, n.name.name),
    }
}

/// Whether `span` reads only module-level names and globals, and whether it holds a function or JSX.
struct Closed<'s> {
    scoping: &'s Scoping,
    span: Span,
    closed: bool,
    code: bool,
}

impl<'a> Visit<'a> for Closed<'_> {
    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        let Some(sym) = it.reference_id.get().and_then(|r| self.scoping.get_reference(r).symbol_id()) else { return };
        let at = self.scoping.symbol_span(sym);
        if self.scoping.symbol_scope_id(sym) != self.scoping.root_scope_id()
            && !(at.start >= self.span.start && at.end <= self.span.end)
        {
            self.closed = false;
        }
    }
    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        self.code = true;
        walk::walk_arrow_function_expression(self, it);
    }
    fn visit_function(&mut self, it: &Function<'a>, flags: oxc_syntax::scope::ScopeFlags) {
        self.code = true;
        walk::walk_function(self, it, flags);
    }
    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        self.code = true;
        walk::walk_jsx_element(self, it);
    }
    fn visit_jsx_fragment(&mut self, it: &JSXFragment<'a>) {
        self.code = true;
        walk::walk_jsx_fragment(self, it);
    }
}

/// A value that reads the same on both sides: no calls, so `Date.now()` is the server's and travels.
fn plain_shape(e: &Expression<'_>) -> bool {
    match e.get_inner_expression() {
        Expression::Identifier(_)
        | Expression::StringLiteral(_)
        | Expression::NumericLiteral(_)
        | Expression::BooleanLiteral(_)
        | Expression::NullLiteral(_) => true,
        Expression::StaticMemberExpression(m) => plain_shape(&m.object),
        Expression::ArrayExpression(a) => a.elements.iter().all(|x| x.as_expression().is_some_and(plain_shape)),
        Expression::ObjectExpression(o) => o
            .properties
            .iter()
            .all(|p| matches!(p, ObjectPropertyKind::ObjectProperty(p) if !p.computed && plain_shape(&p.value))),
        _ => false,
    }
}

fn attr_kind(scoping: &Scoping, a: &JSXAttribute<'_>) -> &'static str {
    let check = |visit: &dyn Fn(&mut Closed)| {
        let mut c = Closed { scoping, span: a.span, closed: true, code: false };
        visit(&mut c);
        (c.closed, c.code)
    };
    let (closed, code, plain) = match &a.value {
        None | Some(JSXAttributeValue::StringLiteral(_)) => return "lit",
        Some(JSXAttributeValue::Element(el)) => {
            let (c, _) = check(&|v| v.visit_jsx_element(el));
            (c, true, false)
        }
        Some(JSXAttributeValue::Fragment(f)) => {
            let (c, _) = check(&|v| v.visit_jsx_fragment(f));
            (c, true, false)
        }
        Some(JSXAttributeValue::ExpressionContainer(c)) => {
            let Some(e) = c.expression.as_expression() else { return "lit" };
            if matches!(
                e.get_inner_expression(),
                Expression::StringLiteral(_)
                    | Expression::NumericLiteral(_)
                    | Expression::BooleanLiteral(_)
                    | Expression::NullLiteral(_)
            ) {
                return "lit";
            }
            let (closed, code) = check(&|v| v.visit_expression(e));
            (closed, code, plain_shape(e))
        }
    };
    match (code, closed) {
        (true, true) => "closed",
        (true, false) => "closure",
        // A handler that isn't written here is still a function, so it can't travel.
        (false, _) if is_handler(&attr_name(a)) => {
            if closed && plain {
                "closed"
            } else {
                "closure"
            }
        }
        (false, true) if plain => "closed",
        (false, _) => "value",
    }
}

fn kids_closed(scoping: &Scoping, el: &JSXElement<'_>) -> bool {
    let mut c = Closed { scoping, span: el.span, closed: true, code: false };
    for k in &el.children {
        c.visit_jsx_child(k);
    }
    c.closed
}

fn has_kids(el: &JSXElement<'_>) -> bool {
    el.children.iter().any(|k| match k {
        JSXChild::Text(t) => !t.value.trim().is_empty(),
        JSXChild::ExpressionContainer(c) => c.expression.as_expression().is_some(),
        _ => true,
    })
}

#[derive(Default)]
struct Frame {
    uses: Vec<String>,
    own: Option<String>,
    early: Option<String>,
    globals: Vec<String>,
    calls: Vec<String>,
}

fn add(list: &mut Vec<String>, name: String) {
    if !list.contains(&name) {
        list.push(name);
    }
}

/// Methods whose call moves the user: they can't wait, whatever island they're in.
const MOVES: &[&str] =
    &["focus", "scrollIntoView", "scrollTo", "scrollBy", "showModal", "showPopover", "requestFullscreen", "select"];
const WINDOW: &[&str] = &["window", "globalThis", "self"];

#[derive(Default)]
struct Calls(bool);

impl<'a> Visit<'a> for Calls {
    fn visit_call_expression(&mut self, _: &CallExpression<'a>) {
        self.0 = true;
    }
}

struct Collect<'s> {
    scoping: &'s Scoping,
    source: &'s str,
    frames: Vec<Frame>,
    sites: Vec<Site>,
    count: u32,
    /// Inside a handler's value: it runs on an event, which replays.
    handler: u32,
}

impl Collect<'_> {
    fn own(&mut self, reason: String) {
        let f = self.frames.last_mut().unwrap();
        f.own.get_or_insert(reason);
    }

    fn early(&mut self, reason: String) {
        self.frames.last_mut().unwrap().early.get_or_insert(reason);
    }

    /// An attribute on a plain element: a handler's value runs on its event.
    fn attribute(&mut self, a: &JSXAttributeItem<'_>) {
        let on = matches!(a, JSXAttributeItem::Attribute(a) if attr_name(a) != "ref" && is_handler(&attr_name(a)));
        self.handler += u32::from(on);
        self.visit_jsx_attribute_item(a);
        self.handler -= u32::from(on);
    }

    fn framed(&mut self, f: impl FnOnce(&mut Self)) -> Frame {
        self.frames.push(Frame::default());
        f(self);
        let frame = self.frames.pop().unwrap();
        if let Some(up) = self.frames.last_mut() {
            up.early = up.early.take().or(frame.early.clone());
            for g in &frame.globals {
                add(&mut up.globals, g.clone());
            }
            for c in &frame.calls {
                add(&mut up.calls, c.clone());
            }
        }
        frame
    }

    fn global(&mut self, name: &str) {
        if self.handler == 0 {
            add(&mut self.frames.last_mut().unwrap().globals, name.to_string());
        }
    }

    /// `name` when `id` is bound at module level.
    fn top(&self, id: &IdentifierReference<'_>) -> Option<String> {
        let sym = id.reference_id.get().and_then(|r| self.scoping.get_reference(r).symbol_id())?;
        (self.scoping.symbol_scope_id(sym) == self.scoping.root_scope_id()).then(|| id.name.to_string())
    }

    fn tag(&self, name: &JSXElementName<'_>) -> (String, Option<String>) {
        match name {
            JSXElementName::IdentifierReference(id) => (self.top(id).unwrap_or_default(), None),
            JSXElementName::MemberExpression(m) => match &m.object {
                JSXMemberExpressionObject::IdentifierReference(id) => {
                    (self.top(id).unwrap_or_default(), Some(m.property.name.to_string()))
                }
                _ => (String::new(), None),
            },
            _ => (String::new(), None),
        }
    }
}

impl<'a> Visit<'a> for Collect<'_> {
    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        if let Some(name) = self.top(it) {
            add(&mut self.frames.last_mut().unwrap().uses, name);
        } else if it.reference_id.get().and_then(|r| self.scoping.get_reference(r).symbol_id()).is_none()
            && !WINDOW.contains(&it.name.as_str())
        {
            self.global(&it.name);
        }
    }

    fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
        if matches!(it.object.get_inner_expression(), Expression::Identifier(id) if WINDOW.contains(&id.name.as_str()))
        {
            self.global(&it.property.name);
        }
        walk::walk_static_member_expression(self, it);
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        if self.handler == 0 {
            match it.callee.get_inner_expression() {
                Expression::Identifier(id) => {
                    if let Some(name) = self.top(id) {
                        add(&mut self.frames.last_mut().unwrap().calls, name);
                    }
                }
                Expression::StaticMemberExpression(m) => {
                    if MOVES.contains(&m.property.name.as_str()) {
                        self.global(&format!(".{}", m.property.name));
                    }
                    if let Expression::Identifier(id) = m.object.get_inner_expression()
                        && let Some(name) = self.top(id)
                    {
                        add(&mut self.frames.last_mut().unwrap().calls, name);
                    }
                }
                _ => {}
            }
        }
        walk::walk_call_expression(self, it);
    }

    fn visit_ts_type(&mut self, _: &TSType<'a>) {}

    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        let open = &it.opening_element;
        if !component_tag(&open.name) {
            for a in &open.attributes {
                let JSXAttributeItem::Attribute(a) = a else { continue };
                let name = attr_name(a);
                let line = line_col(self.source, a.span.start).0;
                if is_handler(&name) {
                    self.own(format!("`{name}` on an element (line {line})"));
                }
                if name.eq_ignore_ascii_case("autofocus") {
                    self.early(format!("`autofocus` (line {line})"));
                }
                if name == "ref" && a.value.as_ref().is_some_and(calls) {
                    self.early(format!("a `ref` callback that does work (line {line})"));
                }
            }
            for a in &open.attributes {
                self.attribute(a);
            }
            for k in &it.children {
                self.visit_jsx_child(k);
            }
            return;
        }
        let index = self.count;
        self.count += 1;
        let (tag, member) = self.tag(&open.name);
        let (mut attrs, mut handler) = (Vec::new(), false);
        for item in &open.attributes {
            match item {
                JSXAttributeItem::SpreadAttribute(s) => {
                    let f = self.framed(|c| c.visit_expression(&s.argument));
                    attrs.push(Attr { name: "...".into(), kind: "spread".into(), uses: f.uses, own: f.own });
                }
                JSXAttributeItem::Attribute(a) => {
                    let name = attr_name(a);
                    if name == "key" {
                        continue;
                    }
                    handler |= is_handler(&name);
                    let kind = attr_kind(self.scoping, a).to_string();
                    if name == "ref" && a.value.as_ref().is_some_and(calls) {
                        let line = line_col(self.source, a.span.start).0;
                        self.early(format!("a `ref` callback that does work (line {line})"));
                    }
                    let f = self.framed(|c| {
                        let on = name != "ref" && is_handler(&name);
                        c.handler += u32::from(on);
                        if let Some(v) = &a.value {
                            c.visit_jsx_attribute_value(v);
                        }
                        c.handler -= u32::from(on);
                    });
                    attrs.push(Attr { name, kind, uses: f.uses, own: f.own });
                }
            }
        }
        let first = self.sites.len();
        let scoping = self.scoping;
        let f = self.framed(|c| {
            for k in &it.children {
                c.visit_jsx_child(k);
            }
        });
        let function_child = it.children.iter().any(|k| {
            matches!(k, JSXChild::ExpressionContainer(c) if c.expression.as_expression().is_some_and(|e| matches!(e.get_inner_expression(), Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_))))
        });
        let kids = Kids {
            present: has_kids(it),
            closed: kids_closed(scoping, it),
            own: f.own.or(function_child.then(|| "a function child".to_string())),
            uses: f.uses,
            sites: self.sites[first..].iter().map(|s| s.index).collect(),
        };
        let line = line_col(self.source, it.span.start).0;
        // Before its children's, so the list reads in source order.
        self.sites.insert(first, Site { index, line, tag, member, handler, attrs, kids });
    }
}

fn calls(v: &JSXAttributeValue<'_>) -> bool {
    let mut c = Calls::default();
    c.visit_jsx_attribute_value(v);
    c.0
}

fn hatch(source: &str, from: u32, to: u32) -> Option<String> {
    let text = source.get(from as usize..to as usize)?;
    if text.contains("@weft client") {
        Some("client".into())
    } else if text.contains("@weft static") {
        Some("static".into())
    } else if text.contains("@weft visible") {
        Some("visible".into())
    } else {
        None
    }
}

const NOT_CODE: &[&str] = &[".css", ".scss", ".sass", ".less", ".styl", ".pcss"];

pub fn facts(program: &Program<'_>, scoping: &Scoping, source: &str) -> HydrationFacts {
    let mut out = HydrationFacts::default();
    let mut c = Collect { scoping, source, frames: Vec::new(), sites: Vec::new(), count: 0, handler: 0 };
    let mut gap = 0u32;
    for stmt in &program.body {
        let span = stmt.span();
        let force = hatch(source, gap, span.start);
        gap = span.end;
        let line = line_col(source, span.start).0;
        let mut node = |c: &mut Collect, name: String, value: bool, visit: &dyn Fn(&mut Collect)| {
            let f = c.framed(|c| visit(c));
            out.nodes.push(Node {
                name,
                line,
                own: f.own,
                force: force.clone(),
                uses: f.uses,
                sites: std::mem::take(&mut c.sites),
                value,
                early: f.early,
                globals: f.globals,
                calls: f.calls,
            });
        };
        match stmt {
            Statement::ImportDeclaration(i) => {
                if i.import_kind.is_type() {
                    continue;
                }
                let source_name = i.source.value.to_string();
                match &i.specifiers {
                    None => {}
                    Some(list) if list.is_empty() => {}
                    Some(list) => {
                        for s in list {
                            let (imported, kind_type) = match s {
                                ImportDeclarationSpecifier::ImportSpecifier(n) => {
                                    (n.imported.name().to_string(), n.import_kind.is_type())
                                }
                                ImportDeclarationSpecifier::ImportDefaultSpecifier(_) => ("default".to_string(), false),
                                ImportDeclarationSpecifier::ImportNamespaceSpecifier(_) => ("*".to_string(), false),
                            };
                            if !kind_type {
                                out.imports.push(Import {
                                    local: s.local().name.to_string(),
                                    source: source_name.clone(),
                                    imported,
                                });
                            }
                        }
                        continue;
                    }
                }
                let plain = source_name.split('?').next().unwrap_or("");
                if !NOT_CODE.iter().any(|x| plain.ends_with(x))
                    && !source_name.starts_with("weft:")
                    && !source_name.starts_with("virtual:")
                {
                    out.side.push(source_name.clone());
                }
            }
            Statement::FunctionDeclaration(f) => {
                let name = f.id.as_ref().map_or("(function)".to_string(), |i| i.name.to_string());
                node(&mut c, name, false, &|c| c.visit_function(f, oxc_syntax::scope::ScopeFlags::empty()));
            }
            Statement::VariableDeclaration(v) => {
                for d in &v.declarations {
                    let names = binding_names(&d.id);
                    let name = names.first().cloned().unwrap_or_default();
                    node(&mut c, name, holds_value(d), &|c| c.visit_variable_declarator(d));
                }
            }
            Statement::ClassDeclaration(k) => {
                let name = k.id.as_ref().map_or("(class)".to_string(), |i| i.name.to_string());
                node(&mut c, name, false, &|c| c.visit_class(k));
            }
            Statement::ExportDefaultDeclaration(e) => match &e.declaration {
                ExportDefaultDeclarationKind::Identifier(id) => {
                    out.exports.push(Export {
                        exported: "default".into(),
                        local: Some(id.name.to_string()),
                        ..Default::default()
                    });
                }
                ExportDefaultDeclarationKind::FunctionDeclaration(f) => {
                    let name = f.id.as_ref().map_or("default".to_string(), |i| i.name.to_string());
                    out.exports.push(Export {
                        exported: "default".into(),
                        local: Some(name.clone()),
                        ..Default::default()
                    });
                    node(&mut c, name, false, &|c| c.visit_function(f, oxc_syntax::scope::ScopeFlags::empty()));
                }
                ExportDefaultDeclarationKind::ClassDeclaration(k) => {
                    out.exports.push(Export {
                        exported: "default".into(),
                        local: Some("default".into()),
                        ..Default::default()
                    });
                    node(&mut c, "default".into(), false, &|c| c.visit_class(k));
                }
                d => {
                    if let Some(x) = d.as_expression() {
                        out.exports.push(Export {
                            exported: "default".into(),
                            local: Some("default".into()),
                            ..Default::default()
                        });
                        node(&mut c, "default".into(), false, &|c| c.visit_expression(x));
                    }
                }
            },
            Statement::ExportDeclaration(e) => match &e.declaration {
                Declaration::FunctionDeclaration(f) => {
                    let name = f.id.as_ref().map_or(String::new(), |i| i.name.to_string());
                    out.exports.push(Export {
                        exported: name.clone(),
                        local: Some(name.clone()),
                        ..Default::default()
                    });
                    node(&mut c, name, false, &|c| c.visit_function(f, oxc_syntax::scope::ScopeFlags::empty()));
                }
                Declaration::VariableDeclaration(v) => {
                    for d in &v.declarations {
                        let names = binding_names(&d.id);
                        for n in &names {
                            out.exports.push(Export {
                                exported: n.clone(),
                                local: Some(n.clone()),
                                ..Default::default()
                            });
                        }
                        node(&mut c, names.first().cloned().unwrap_or_default(), holds_value(d), &|c| {
                            c.visit_variable_declarator(d);
                        });
                    }
                }
                Declaration::ClassDeclaration(k) => {
                    let name = k.id.as_ref().map_or(String::new(), |i| i.name.to_string());
                    out.exports.push(Export {
                        exported: name.clone(),
                        local: Some(name.clone()),
                        ..Default::default()
                    });
                    node(&mut c, name, false, &|c| c.visit_class(k));
                }
                Declaration::TSEnumDeclaration(k) => {
                    let name = k.id.name.to_string();
                    out.exports.push(Export { exported: name.clone(), local: Some(name), ..Default::default() });
                }
                _ => {}
            },
            Statement::ExportNamedDeclaration(e) => {
                if e.export_kind.is_type() {
                    continue;
                }
                for s in &e.specifiers {
                    if s.export_kind.is_type() {
                        continue;
                    }
                    let exported = s.exported.name().to_string();
                    let name = s.local.name().to_string();
                    out.exports.push(Export { exported, local: Some(name), ..Default::default() });
                }
            }
            Statement::ExportFromDeclaration(e) => {
                if !e.export_kind.is_type() {
                    for s in &e.specifiers {
                        if !s.export_kind.is_type() {
                            out.exports.push(Export {
                                exported: s.exported.name().to_string(),
                                local: None,
                                source: Some(e.source.value.to_string()),
                                imported: Some(s.local.name().to_string()),
                            });
                        }
                    }
                }
            }
            Statement::ExportAllDeclaration(e) => {
                if !e.export_kind.is_type() {
                    match &e.exported {
                        Some(n) => out.exports.push(Export {
                            exported: n.name().to_string(),
                            local: None,
                            source: Some(e.source.value.to_string()),
                            imported: Some("*".into()),
                        }),
                        None => out.stars.push(e.source.value.to_string()),
                    }
                }
            }
            Statement::TSTypeAliasDeclaration(_)
            | Statement::TSInterfaceDeclaration(_)
            | Statement::TSEnumDeclaration(_)
            | Statement::EmptyStatement(_) => {}
            other => {
                out.effects.get_or_insert(format!("a top-level statement (line {line})"));
                node(&mut c, "(module)".into(), false, &|c| c.visit_statement(other));
            }
        }
    }
    out
}

fn holds_value(d: &VariableDeclarator<'_>) -> bool {
    !d.init.as_ref().is_some_and(|e| {
        matches!(e.get_inner_expression(), Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_))
    })
}

fn binding_names(p: &BindingPattern<'_>) -> Vec<String> {
    match p {
        BindingPattern::BindingIdentifier(id) => vec![id.name.to_string()],
        BindingPattern::ObjectPattern(o) => o.properties.iter().flat_map(|x| binding_names(&x.value)).collect(),
        BindingPattern::ArrayPattern(a) => a.elements.iter().flatten().flat_map(binding_names).collect(),
        BindingPattern::AssignmentPattern(a) => binding_names(&a.left),
    }
}

/// `source` with `$iN` appended for each island: the same text as the call site, with server values and the slot read
/// from `_p`. Parsed separately so `compile` can run on the result as if it were authored.
pub fn hoisted(source: &str, source_type: SourceType, islands: &Islands) -> Option<String> {
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, source_type).parse();
    if parsed.panicked || !parsed.diagnostics.is_empty() {
        return None;
    }
    let semantic = SemanticBuilder::new().build(&parsed.program).semantic;
    let mut h = Hoist { scoping: semantic.scoping(), source, islands, count: 0, out: String::new() };
    h.visit_program(&parsed.program);
    Some(h.out)
}

struct Hoist<'s> {
    scoping: &'s Scoping,
    source: &'s str,
    islands: &'s Islands,
    count: u32,
    out: String,
}

impl<'a> Visit<'a> for Hoist<'_> {
    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        if component_tag(&it.opening_element.name) {
            let index = self.count;
            self.count += 1;
            if let Some(site) = self.islands.sites.iter().find(|s| s.index == index) {
                let text = |s: Span| &self.source[s.start as usize..s.end as usize];
                let tag = text(it.opening_element.name.span());
                let mut attrs = String::new();
                let mut k = 0;
                for a in &it.opening_element.attributes {
                    let JSXAttributeItem::Attribute(a) = a else { continue };
                    let name = attr_name(a);
                    if name == "key" {
                        continue;
                    }
                    attrs.push(' ');
                    if attr_kind(self.scoping, a) == "value" {
                        attrs.push_str(&format!("{name}={{_p.v[{k}]}}"));
                        k += 1;
                    } else {
                        attrs.push_str(text(a.span));
                    }
                }
                let body = match (&it.closing_element, has_kids(it)) {
                    (Some(close), true) if site.hoist => {
                        text(Span::new(it.opening_element.span.end, close.span.start)).to_string()
                    }
                    (_, true) => "{_p.s}".to_string(),
                    _ => String::new(),
                };
                self.out.push_str(&format!("\nexport const $i{index} = (_p) => <{tag}{attrs}>{body}</{tag}>;\n"));
            }
        }
        walk::walk_jsx_element(self, it);
    }
}

/// Mark each island's tag for the SSR back end.
pub fn mark<'a>(allocator: &'a Allocator, program: &mut Program<'a>, scoping: &Scoping, islands: &Islands) {
    let mut m = Mark { allocator, scoping, islands, count: 0 };
    m.visit_program(program);
}

struct Mark<'a, 's> {
    allocator: &'a Allocator,
    scoping: &'s Scoping,
    islands: &'s Islands,
    count: u32,
}

impl<'a> VisitMut<'a> for Mark<'a, '_> {
    fn visit_jsx_element(&mut self, it: &mut JSXElement<'a>) {
        if component_tag(&it.opening_element.name) {
            let index = self.count;
            self.count += 1;
            if let Some(site) = self.islands.sites.iter().find(|s| s.index == index) {
                let values: Vec<String> = it
                    .opening_element
                    .attributes
                    .iter()
                    .filter_map(|a| match a {
                        JSXAttributeItem::Attribute(a)
                            if attr_name(a) != "key" && attr_kind(self.scoping, a) == "value" =>
                        {
                            Some(attr_name(a))
                        }
                        _ => None,
                    })
                    .collect();
                let slot = !site.hoist && has_kids(it);
                let value = format!(
                    "{}#{index}|{}|{}|{}",
                    self.islands.id,
                    values.join(","),
                    if slot { "s" } else { "" },
                    site.when
                );
                let ast = oxc_ast::builder::AstBuilder::new(self.allocator);
                let name = JSXAttributeName::new_identifier(SPAN, ISLAND, &ast);
                let lit = JSXAttributeValue::new_string_literal(SPAN, self.allocator.alloc_str(&value), None, &ast);
                it.opening_element.attributes.push(JSXAttributeItem::new_attribute(SPAN, name, Some(lit), &ast));
            }
        }
        walk_mut::walk_jsx_element(self, it);
    }
}

/// `(id, values, slot, when)` of a marked tag.
pub fn marked(value: &str) -> Option<(String, Vec<String>, bool, String)> {
    let mut parts = value.split('|');
    let id = parts.next()?.to_string();
    let values = parts.next()?.split(',').filter(|s| !s.is_empty()).map(str::to_string).collect();
    let slot = parts.next() == Some("s");
    Some((id, values, slot, parts.next().unwrap_or("").to_string()))
}

/// Sites by index, for tests and callers that want one.
pub fn by_index(facts: &HydrationFacts) -> HashMap<u32, &Site> {
    facts.nodes.iter().flat_map(|n| n.sites.iter().map(|s| (s.index, s))).collect()
}
