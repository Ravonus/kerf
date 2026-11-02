//! Shape variants (research 31 §5). For each component that returns JSX this writes `Name$shape`: the same markup,
//! with its text in `[data-skeleton]` spans and none of its behaviour, reading placeholders instead of data. A
//! variant is source text appended to the printed module, so the back end lowers it like any JSX (DOM, SSR, hydration)
//! and no pre-pass sees it. Nothing imports a variant until a `<Boundary pending="shape">` reaches it, so the rest
//! tree-shake away. `pending="shape"` becomes `shape={site}`: `<Boundary>` reserves a variant's place from the first paint.
//!
//! | Authored | Variant |
//! |---|---|
//! | host element | same tag, static sizing attributes |
//! | `{post.title}` | `<span data-skeleton …>{$$st(() => post.title)}</span>` |
//! | `{local}` (setup the variant drops) | the same span with no reader: one bar |
//! | `xs.map(x => …)`, `a ? b : c`, `a && b` | the same, over placeholders |
//! | `const x = q(…)` | `const x = $$sr(q)` |
//! | `<Row post={p} />` | `<Row$shape post={p} />` when `Row` has a variant, else its children or one bar |

use std::collections::{BTreeSet, HashMap, HashSet};

use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_ast_visit::{Visit, VisitMut, walk, walk_mut};
use oxc_parser::Parser;
use oxc_semantic::{Scoping, SymbolId};
use oxc_span::{GetSpan, SourceType, Span};

const WRAP: &str = r#"<div data-scope="skeleton-scope" aria-busy="true" role="status" aria-label="Loading" inert style="display:contents">"#;
const BAR: &str = r#"<span data-skeleton style="color:transparent">"#;
/// Host attributes that size or style an element. Everything else (events, ids, links, values, ARIA) goes.
const KEEP: &[&str] = &[
    "class",
    "className",
    "style",
    "width",
    "height",
    "type",
    "rows",
    "cols",
    "size",
    "colspan",
    "rowspan",
    "hidden",
    "viewBox",
];
const MEDIA: &[&str] = &["img", "video", "iframe", "canvas"];
const FORWARD_SKIP: &[&str] = &["key", "ref"];

/// What `apply` found: the text to append, and the variants this file exports (`Facts::shapes`).
#[derive(Default)]
pub struct Shapes {
    pub code: String,
    pub exports: Vec<String>,
}

struct Comp<'b, 'a> {
    local: String,
    exported: Vec<String>,
    params: &'b FormalParameters<'a>,
    statements: &'b [Statement<'a>],
    /// An arrow's expression body.
    expression: Option<&'b Expression<'a>>,
}

fn strip<'b, 'a>(e: &'b Expression<'a>) -> &'b Expression<'a> {
    match e {
        Expression::ParenthesizedExpression(p) => strip(&p.expression),
        Expression::TSAsExpression(x) => strip(&x.expression),
        Expression::TSNonNullExpression(x) => strip(&x.expression),
        Expression::TSSatisfiesExpression(x) => strip(&x.expression),
        e => e,
    }
}

#[derive(Default)]
struct HasJsx(bool);
impl<'a> Visit<'a> for HasJsx {
    fn visit_jsx_element(&mut self, _: &JSXElement<'a>) {
        self.0 = true;
    }
    fn visit_jsx_fragment(&mut self, _: &JSXFragment<'a>) {
        self.0 = true;
    }
}

fn has_jsx(e: &Expression<'_>) -> bool {
    let mut v = HasJsx::default();
    v.visit_expression(e);
    v.0
}

/// The expression a function returns: an arrow's body, or its last top-level `return`.
fn returned<'b, 'a>(
    statements: &'b [Statement<'a>],
    expression: Option<&'b Expression<'a>>,
) -> Option<&'b Expression<'a>> {
    expression.or_else(|| {
        statements.iter().rev().find_map(|s| match s {
            Statement::ReturnStatement(r) => r.argument.as_ref(),
            _ => None,
        })
    })
}

fn arrow_body<'b, 'a>(f: &'b ArrowFunctionExpression<'a>) -> (&'b [Statement<'a>], Option<&'b Expression<'a>>) {
    match &f.body {
        ArrowFunctionBody::FunctionBody(b) => (&b.statements, None),
        body => (&[], body.as_expression()),
    }
}

fn is_component_name(name: &str) -> bool {
    name.starts_with(|c: char| c.is_ascii_uppercase())
}

/// Identifiers an expression reads, as symbols. Bindings declared inside it don't count.
struct Reads<'s> {
    scoping: &'s Scoping,
    within: Span,
    syms: Vec<SymbolId>,
}
impl<'a> Visit<'a> for Reads<'_> {
    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        let Some(sym) = it.reference_id.get().and_then(|r| self.scoping.get_reference(r).symbol_id()) else { return };
        let at = self.scoping.symbol_span(sym);
        if at.start < self.within.start || at.end > self.within.end {
            self.syms.push(sym);
        }
    }
}

#[derive(Default)]
struct Bindings(Vec<SymbolId>);
impl<'a> Visit<'a> for Bindings {
    fn visit_binding_identifier(&mut self, it: &BindingIdentifier<'a>) {
        self.0.extend(it.symbol_id.get());
    }
}

struct Gen<'s> {
    scoping: &'s Scoping,
    source: &'s str,
    /// Components with a variant: local symbol → the tag the variant is under here.
    variants: HashMap<SymbolId, String>,
    /// Symbols of `Text` from `@weft-js/core/text`: it stays itself, so its element and class survive.
    text: Option<SymbolId>,
    /// `weft`'s own imports: `derived` stays, `resource` is read by its fetcher, and the rest (`state`…) is setup.
    weft: HashMap<SymbolId, String>,
    /// Imported variants actually used.
    used: BTreeSet<SymbolId>,
    imports: HashMap<SymbolId, String>,
}

impl Gen<'_> {
    fn reads(&self, e: &Expression<'_>) -> Vec<SymbolId> {
        let mut v = Reads { scoping: self.scoping, within: e.span(), syms: Vec::new() };
        v.visit_expression(e);
        v.syms
    }

    /// Everything `e` reads is kept: placeholders, module scope, or a global.
    fn ok(&self, e: &Expression<'_>, allowed: &HashSet<SymbolId>) -> bool {
        let root = self.scoping.root_scope_id();
        self.reads(e).iter().all(|s| allowed.contains(s) || self.scoping.symbol_scope_id(*s) == root)
    }

    fn print(&self, e: &Expression<'_>) -> String {
        let mut c = oxc_codegen::Codegen::new();
        c.print_expression(e);
        c.into_source_text()
    }

    fn pattern(&self, p: &BindingPattern<'_>) -> String {
        let s = p.span();
        self.source[s.start as usize..s.end as usize].to_string()
    }

    fn bar(read: Option<String>) -> String {
        match read {
            Some(e) => format!("{BAR}{{$$st(() => ({e}))}}</span>"),
            None => format!("{BAR}{{$$st()}}</span>"),
        }
    }

    /// A value in a child position, as a JS expression.
    fn value(&mut self, e: &Expression<'_>, allowed: &HashSet<SymbolId>) -> String {
        let e = strip(e);
        match e {
            Expression::JSXElement(el) => self.element(el, allowed),
            Expression::JSXFragment(f) => format!("<>{}</>", self.kids(&f.children, allowed)),
            Expression::NullLiteral(_) | Expression::BooleanLiteral(_) => "null".into(),
            Expression::StringLiteral(_) | Expression::NumericLiteral(_) | Expression::TemplateLiteral(_)
                if self.ok(e, allowed) =>
            {
                self.print(e)
            }
            Expression::Identifier(i) if i.name == "undefined" => "null".into(),
            Expression::ConditionalExpression(c) if has_jsx(&c.consequent) || has_jsx(&c.alternate) => {
                if self.ok(&c.test, allowed) {
                    format!(
                        "({} ? {} : {})",
                        self.print(&c.test),
                        self.value(&c.consequent, allowed),
                        self.value(&c.alternate, allowed)
                    )
                } else if matches!(strip(&c.consequent), Expression::NullLiteral(_)) {
                    self.value(&c.alternate, allowed)
                } else {
                    self.value(&c.consequent, allowed)
                }
            }
            Expression::LogicalExpression(l) if has_jsx(&l.right) && l.operator == LogicalOperator::And => {
                if self.ok(&l.left, allowed) {
                    format!("({} && {})", self.print(&l.left), self.value(&l.right, allowed))
                } else {
                    self.value(&l.right, allowed)
                }
            }
            Expression::ChainExpression(c) => match &c.expression {
                ChainElement::CallExpression(call) => self.call(call, e, allowed),
                _ => self.text(e, allowed),
            },
            Expression::CallExpression(call) => self.call(call, e, allowed),
            _ => self.text(e, allowed),
        }
    }

    fn text(&self, e: &Expression<'_>, allowed: &HashSet<SymbolId>) -> String {
        let ok = self.ok(e, allowed);
        let children = match e {
            Expression::Identifier(i) => i.name == "children",
            Expression::StaticMemberExpression(m) => m.property.name == "children",
            _ => false,
        };
        match (children, ok) {
            (true, true) => self.print(e), // a layout's children are variants already
            (true, false) => "null".into(),
            (false, ok) => Self::bar(ok.then(|| self.print(e))),
        }
    }

    /// `xs.map(x => <li />)`: the same `.map`, with the variant of its body.
    fn call(&mut self, call: &CallExpression<'_>, whole: &Expression<'_>, allowed: &HashSet<SymbolId>) -> String {
        let list = match &call.callee {
            Expression::StaticMemberExpression(m) if m.property.name == "map" => Some(&m.object),
            _ => None,
        };
        let cb = call.arguments.first().and_then(Argument::as_expression).map(strip);
        let (Some(list), Some(cb)) = (list, cb) else { return self.text(whole, allowed) };
        let (params, statements, expression) = match cb {
            Expression::ArrowFunctionExpression(f) => {
                let (s, x) = arrow_body(f);
                (&f.params, s, x)
            }
            Expression::FunctionExpression(f) => match &f.body {
                Some(b) => (&f.params, &b.statements[..], None),
                None => return self.text(whole, allowed),
            },
            _ => return self.text(whole, allowed),
        };
        if !self.ok(list, allowed) {
            return self.text(whole, allowed);
        }
        let mut inner = allowed.clone();
        let names: Vec<_> = params.items.iter().map(|p| self.pattern(&p.pattern)).collect();
        let mut b = Bindings::default();
        b.visit_formal_parameters(params);
        inner.extend(b.0);
        let Some(body) = self.body(statements, expression, &mut inner) else { return self.text(whole, allowed) };
        format!("({})?.map(({}) => {{ {body} }})", self.print(list), names.join(", "))
    }

    /// The statements a variant keeps and its `return`.
    fn body(
        &mut self,
        statements: &[Statement<'_>],
        expression: Option<&Expression<'_>>,
        allowed: &mut HashSet<SymbolId>,
    ) -> Option<String> {
        let ret = returned(statements, expression)?;
        // Which locals the result needs, back to front.
        let mut needed: HashSet<SymbolId> = self.reads(ret).into_iter().collect();
        let mut keep = vec![false; statements.len()];
        for (i, s) in statements.iter().enumerate().rev() {
            let Some((sym, init)) = Self::local(s) else { continue };
            if needed.contains(&sym) {
                keep[i] = true;
                needed.extend(self.reads(init));
            }
        }
        let mut out = String::new();
        for (i, s) in statements.iter().enumerate() {
            let Some((sym, init)) = Self::local(s).filter(|_| keep[i]) else { continue };
            let Statement::VariableDeclaration(d) = s else { continue };
            let name = self.pattern(&d.declarations[0].id);
            if let Some(line) = self.keep(&name, init, allowed) {
                out.push_str(&line);
                allowed.insert(sym);
            }
        }
        let v = self.value(ret, allowed);
        Some(format!("{out}return {v};"))
    }

    fn local<'b, 'a>(s: &'b Statement<'a>) -> Option<(SymbolId, &'b Expression<'a>)> {
        let Statement::VariableDeclaration(d) = s else { return None };
        let [one] = d.declarations.as_slice() else { return None };
        let BindingPattern::BindingIdentifier(id) = &one.id else { return None };
        Some((id.symbol_id.get()?, one.init.as_ref()?))
    }

    /// One setup line in a variant, or None to drop it.
    fn keep(&self, name: &str, init: &Expression<'_>, allowed: &HashSet<SymbolId>) -> Option<String> {
        let root = self.scoping.root_scope_id();
        if let Expression::CallExpression(c) = strip(init) {
            if let Expression::Identifier(id) = &c.callee {
                let sym = id.reference_id.get().and_then(|r| self.scoping.get_reference(r).symbol_id());
                match sym.and_then(|s| self.weft.get(&s)).map(String::as_str) {
                    Some("derived") => {
                        return self.ok(init, allowed).then(|| format!("const {name} = {};", self.print(init)));
                    }
                    Some("resource") => {
                        let by = match c.arguments.first().and_then(Argument::as_expression) {
                            Some(e @ Expression::Identifier(id)) if self.ok(e, allowed) => id.name.to_string(),
                            _ => String::new(),
                        };
                        return Some(format!("const {name} = $$sr({by});"));
                    }
                    Some(_) => return None,
                    None => {}
                }
                if sym.is_none_or(|s| self.scoping.symbol_scope_id(s) == root) {
                    return Some(format!("const {name} = $$sr({});", id.name));
                }
            }
            return None;
        }
        self.ok(init, allowed).then(|| format!("const {name} = {};", self.print(init)))
    }

    fn kids(&mut self, kids: &[JSXChild<'_>], allowed: &HashSet<SymbolId>) -> String {
        let mut out = String::new();
        for k in kids {
            match k {
                JSXChild::Text(t) => out.push_str(&self.source[t.span.start as usize..t.span.end as usize]),
                JSXChild::Element(el) => out.push_str(&self.element(el, allowed)),
                JSXChild::Fragment(f) => out.push_str(&self.kids(&f.children, allowed)),
                JSXChild::ExpressionContainer(c) => {
                    let Some(e) = c.expression.as_expression() else { continue };
                    let v = self.value(e, allowed);
                    if v.starts_with('<') { out.push_str(&v) } else { out.push_str(&format!("{{{v}}}")) }
                }
                JSXChild::Spread(_) => {}
            }
        }
        out
    }

    fn attr_name(a: &JSXAttribute<'_>) -> String {
        match &a.name {
            JSXAttributeName::Identifier(i) => i.name.to_string(),
            JSXAttributeName::NamespacedName(n) => format!("{}:{}", n.namespace.name, n.name.name),
        }
    }

    fn attr_text(&self, name: &str, v: &JSXAttributeValue<'_>, allowed: &HashSet<SymbolId>) -> Option<String> {
        match v {
            JSXAttributeValue::StringLiteral(s) => Some(format!("{name}=\"{}\"", s.value.replace('"', "&quot;"))),
            JSXAttributeValue::ExpressionContainer(c) => {
                let e = c.expression.as_expression()?;
                self.ok(e, allowed).then(|| format!("{name}={{{}}}", self.print(e)))
            }
            _ => None,
        }
    }

    fn host_attrs(&self, el: &JSXElement<'_>, allowed: &HashSet<SymbolId>, extra: &[&str]) -> String {
        let mut out = String::new();
        for a in &el.opening_element.attributes {
            let JSXAttributeItem::Attribute(a) = a else { continue };
            let name = Self::attr_name(a);
            if !(KEEP.contains(&name.as_str())
                || extra.contains(&name.as_str())
                || (name.starts_with("data-") && name != "data-testid"))
            {
                continue;
            }
            match &a.value {
                None => out.push_str(&format!(" {name}")),
                Some(v) => {
                    if let Some(t) = self.attr_text(&name, v, allowed) {
                        out.push(' ');
                        out.push_str(&t);
                    }
                }
            }
        }
        out
    }

    fn component_attrs(&self, el: &JSXElement<'_>, allowed: &HashSet<SymbolId>) -> String {
        let mut out = String::new();
        for a in &el.opening_element.attributes {
            let JSXAttributeItem::Attribute(a) = a else { continue };
            let name = Self::attr_name(a);
            if FORWARD_SKIP.contains(&name.as_str())
                || (name.starts_with("on") && name[2..].starts_with(|c: char| c.is_ascii_uppercase()))
            {
                continue;
            }
            let t = match &a.value {
                None => Some(name.clone()),
                Some(v) => self.attr_text(&name, v, allowed),
            };
            out.push(' ');
            out.push_str(&t.unwrap_or_else(|| format!("{name}={{$$sa}}"))); // a dropped local: a value that reads as anything
        }
        out
    }

    fn element(&mut self, el: &JSXElement<'_>, allowed: &HashSet<SymbolId>) -> String {
        let name = &el.opening_element.name;
        if let JSXElementName::Identifier(i) = name {
            let tag = i.name.as_str();
            if MEDIA.contains(&tag) {
                return format!("<{tag}{} data-skeleton />", self.host_attrs(el, allowed, &[]));
            }
            let attrs = self.host_attrs(el, allowed, &[]);
            if el.closing_element.is_none() {
                return format!("<{tag}{attrs} />");
            }
            let kids = self.kids(&el.children, allowed);
            return format!("<{tag}{attrs}>{kids}</{tag}>");
        }
        let sym = match name {
            JSXElementName::IdentifierReference(r) => {
                r.reference_id.get().and_then(|id| self.scoping.get_reference(id).symbol_id())
            }
            _ => None,
        };
        let plain = matches!(name, JSXElementName::IdentifierReference(r) if r.name == "Boundary");
        if sym.is_some() && sym == self.text {
            let JSXElementName::IdentifierReference(r) = name else { unreachable!() };
            let (tag, attrs, kids) = (
                r.name.to_string(),
                self.host_attrs(el, allowed, &["as", "reserve"]),
                self.kids(&el.children, allowed),
            );
            return format!("<{tag}{attrs}>{kids}</{tag}>");
        }
        if let Some(tag) = sym.and_then(|s| self.variants.get(&s).cloned()) {
            if self.imports.contains_key(&sym.unwrap()) {
                self.used.insert(sym.unwrap());
            }
            let attrs = self.component_attrs(el, allowed);
            if el.closing_element.is_none() {
                return format!("<{tag}{attrs} />");
            }
            let kids = self.kids(&el.children, allowed);
            return format!("<{tag}{attrs}>{kids}</{tag}>");
        }
        // No variant: its code must not run with placeholder data, so only the JSX written here renders.
        let kids = self.kids(&el.children, allowed);
        if plain || !kids.trim().is_empty() { format!("<>{kids}</>") } else { Self::bar(None) }
    }
}

struct Sites {
    pending: Vec<u32>,
}

fn is_pending_shape(a: &JSXAttribute<'_>) -> bool {
    matches!(&a.name, JSXAttributeName::Identifier(i) if i.name == "pending")
        && matches!(&a.value, Some(JSXAttributeValue::StringLiteral(s)) if s.value == "shape")
}

struct FindSites<'g, 's, 'o> {
    g: &'g mut Gen<'s>,
    out: &'o mut String,
    sites: Sites,
}

impl<'a> Visit<'a> for FindSites<'_, '_, '_> {
    fn visit_jsx_element(&mut self, el: &JSXElement<'a>) {
        let found = el.opening_element.attributes.iter().find_map(|a| match a {
            JSXAttributeItem::Attribute(a) if is_pending_shape(a) => Some(a),
            _ => None,
        });
        if let Some(a) = found {
            let n = self.sites.pending.len();
            self.sites.pending.push(a.span.start);
            let kids = self.g.kids(&el.children, &HashSet::new());
            self.out.push_str(&format!("function $$site{n}() {{ return {WRAP}{kids}</div>; }}\n"));
        }
        walk::walk_jsx_element(self, el);
    }
}

struct Replace<'a, 'p> {
    allocator: &'a Allocator,
    pending: &'p [u32],
}

impl<'a> VisitMut<'a> for Replace<'a, '_> {
    fn visit_jsx_attribute(&mut self, a: &mut JSXAttribute<'a>) {
        if let Some(n) = self.pending.iter().position(|s| *s == a.span.start) {
            let text = self.allocator.alloc_str(&format!("<a shape={{$$site{n}}} />"));
            let parsed = Parser::new(self.allocator, text, SourceType::tsx()).parse_expression();
            if let Ok(Expression::JSXElement(mut el)) = parsed {
                if let Some(JSXAttributeItem::Attribute(attr)) = el.opening_element.attributes.first_mut() {
                    std::mem::swap(a, attr);
                }
            }
        }
        walk_mut::walk_jsx_attribute(self, a);
    }
}

fn function<'b, 'a>(f: &'b Function<'a>, exported: Vec<String>) -> Option<Comp<'b, 'a>> {
    let b = f.body.as_ref()?;
    Some(Comp {
        local: f.id.as_ref().map_or("Default", |i| i.name.as_str()).to_string(),
        exported,
        params: &f.params,
        statements: &b.statements,
        expression: None,
    })
}

fn collect<'b, 'a>(program: &'b Program<'a>) -> Vec<Comp<'b, 'a>> {
    let mut comps = Vec::new();
    let mut vars = Vec::new();
    let mut names: HashMap<String, Vec<String>> = HashMap::new();
    for s in &program.body {
        match s {
            Statement::FunctionDeclaration(f) => comps.extend(function(f, Vec::new())),
            Statement::VariableDeclaration(d) => vars.push((&**d, false)),
            Statement::ExportDeclaration(e) => match &e.declaration {
                Declaration::FunctionDeclaration(f) => {
                    comps.extend(function(f, f.id.iter().map(|i| i.name.to_string()).collect()))
                }
                Declaration::VariableDeclaration(d) => vars.push((&**d, true)),
                _ => {}
            },
            Statement::ExportNamedDeclaration(e) => {
                for sp in &e.specifiers {
                    names.entry(sp.local.name().to_string()).or_default().push(sp.exported.name().to_string());
                }
            }
            Statement::ExportDefaultDeclaration(e) => match &e.declaration {
                ExportDefaultDeclarationKind::FunctionDeclaration(f) => {
                    comps.extend(function(f, vec!["default".into()]))
                }
                ExportDefaultDeclarationKind::ArrowFunctionExpression(f) => {
                    let (statements, expression) = arrow_body(f);
                    comps.push(Comp {
                        local: "Default".into(),
                        exported: vec!["default".into()],
                        params: &f.params,
                        statements,
                        expression,
                    });
                }
                ExportDefaultDeclarationKind::Identifier(i) => {
                    names.entry(i.name.to_string()).or_default().push("default".into())
                }
                _ => {}
            },
            _ => {}
        }
    }
    for (d, exported) in vars {
        for v in &d.declarations {
            let BindingPattern::BindingIdentifier(id) = &v.id else { continue };
            let exported: Vec<String> = exported.then(|| id.name.to_string()).into_iter().collect();
            let local = id.name.to_string();
            match v.init.as_ref().map(strip) {
                Some(Expression::ArrowFunctionExpression(f)) => {
                    let (statements, expression) = arrow_body(f);
                    comps.push(Comp { local, exported, params: &f.params, statements, expression });
                }
                Some(Expression::FunctionExpression(f)) => {
                    if let Some(b) = &f.body {
                        comps.push(Comp {
                            local,
                            exported,
                            params: &f.params,
                            statements: &b.statements,
                            expression: None,
                        });
                    }
                }
                _ => {}
            }
        }
    }
    for c in &mut comps {
        if let Some(more) = names.remove(&c.local) {
            c.exported.extend(more);
        }
    }
    comps.retain(|c| is_component_name(&c.local) && returned(c.statements, c.expression).is_some_and(has_jsx));
    comps
}

/// The exports of this file that have a variant (`Facts::shapes`, a check pass).
pub fn exports(program: &Program<'_>) -> Vec<String> {
    collect(program).into_iter().flat_map(|c| c.exported).collect()
}

/// Generate this file's variants and lower its `pending="shape"` sites. `known` is `options.shapes`: the imported
/// components with variants, keyed like `options.groups`. `None`: only what this file's own sites need.
pub fn apply<'a>(
    allocator: &'a Allocator,
    program: &mut Program<'a>,
    scoping: &Scoping,
    source: &str,
    filename: &str,
    known: Option<&HashMap<String, bool>>,
) -> Shapes {
    let wanted = known.is_some() || source.contains("pending=\"shape\"");
    if !wanted {
        return Shapes::default();
    }
    let mut g = Gen {
        scoping,
        source,
        variants: HashMap::new(),
        text: None,
        weft: HashMap::new(),
        used: BTreeSet::new(),
        imports: HashMap::new(),
    };
    let mut import_lines = HashMap::new();
    for stmt in &program.body {
        let Statement::ImportDeclaration(d) = stmt else { continue };
        let from = d.source.value.as_str();
        for spec in d.specifiers.iter().flatten() {
            let (sym, imported) = match spec {
                ImportDeclarationSpecifier::ImportSpecifier(s) => {
                    (s.local.symbol_id.get(), s.imported.name().to_string())
                }
                ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => {
                    (s.local.symbol_id.get(), "default".to_string())
                }
                _ => continue,
            };
            let Some(sym) = sym else { continue };
            if from == "@weft-js/core/text" && imported == "Text" {
                g.text = Some(sym);
            } else if from == "@weft-js/core" {
                g.weft.insert(sym, imported);
            } else if from.starts_with('.')
                && known
                    .is_some_and(|k| k.contains_key(&format!("{}#{imported}", crate::style::resolve(filename, from))))
            {
                let local = spec.local().name.to_string();
                let tag = format!("{}{local}$$v", if is_component_name(&local) { "" } else { "V" });
                g.variants.insert(sym, tag.clone());
                g.imports.insert(sym, tag.clone());
                import_lines.insert(sym, format!("import {{ {imported}$shape as {tag} }} from {:?};\n", from));
            }
        }
    }

    let mut code = String::new();
    let mut exports = Vec::new();
    let comps = collect(program);
    for c in &comps {
        if let Some(sym) = scoping.get_root_binding(c.local.as_str().into()) {
            g.variants.insert(sym, format!("{}$shape", c.local));
        }
    }
    for c in &comps {
        let mut b = Bindings::default();
        b.visit_formal_parameters(c.params);
        let mut allowed: HashSet<SymbolId> = b.0.into_iter().collect();
        let param = c.params.items.first().map(|p| g.pattern(&p.pattern)).unwrap_or_default();
        let Some(body) = g.body(c.statements, c.expression, &mut allowed) else { continue };
        code.push_str(&format!("function {}$shape({param}) {{ {body} }}\n", c.local));
        for e in &c.exported {
            code.push_str(&format!("export {{ {}$shape as {e}$shape }};\n", c.local));
            exports.push(e.clone());
        }
    }
    let mut find = FindSites { g: &mut g, out: &mut code, sites: Sites { pending: Vec::new() } };
    find.visit_program(program);
    let sites = find.sites.pending;
    drop(comps);
    Replace { allocator, pending: &sites }.visit_program(program);

    if code.is_empty() {
        return Shapes { code, exports };
    }
    let mut head = String::from(
        "import { shapeAny as $$sa, shapeRead as $$sr, shapeText as $$st } from \"@weft-js/core/shape\";\n",
    );
    for s in &g.used {
        head.push_str(&import_lines[s]);
    }
    Shapes { code: head + &code, exports }
}
