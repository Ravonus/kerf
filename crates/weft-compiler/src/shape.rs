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

mod collect;
mod elements;
mod generate;

use std::collections::{BTreeSet, HashMap, HashSet};
use std::fmt::Write as _;

use collect::collect;
use oxc_allocator::Allocator;
use oxc_ast::ast::{
    ArrowFunctionBody, ArrowFunctionExpression, BindingIdentifier, Expression, FormalParameters,
    IdentifierReference, ImportDeclarationSpecifier, JSXAttribute, JSXAttributeItem,
    JSXAttributeName, JSXAttributeValue, JSXElement, JSXFragment, Program, Statement,
};
use oxc_ast_visit::{Visit, VisitMut, walk, walk_mut};
use oxc_parser::Parser;
use oxc_semantic::{Scoping, SymbolId};
use oxc_span::{SourceType, Span};

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

fn arrow_body<'b, 'a>(
    f: &'b ArrowFunctionExpression<'a>,
) -> (&'b [Statement<'a>], Option<&'b Expression<'a>>) {
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
        let Some(sym) = it
            .reference_id
            .get()
            .and_then(|r| self.scoping.get_reference(r).symbol_id())
        else {
            return;
        };
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
    standalone: bool,
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
            let _ = writeln!(
                self.out,
                "function $$site{n}() {{ return {WRAP}{kids}</div>; }}"
            );
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
            let text = self
                .allocator
                .alloc_str(&format!("<a shape={{$$site{n}}} />"));
            let parsed = Parser::new(self.allocator, text, SourceType::tsx()).parse_expression();
            if let Ok(Expression::JSXElement(mut el)) = parsed
                && let Some(JSXAttributeItem::Attribute(attr)) =
                    el.opening_element.attributes.first_mut()
            {
                std::mem::swap(a, attr);
            }
        }
        walk_mut::walk_jsx_attribute(self, a);
    }
}

/// The exports of this file that have a variant (`Facts::shapes`, a check pass).
pub fn exports(program: &Program<'_>) -> Vec<String> {
    collect(program)
        .into_iter()
        .flat_map(|c| c.exported)
        .collect()
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
    let standalone = filename.ends_with("?weft-shape");
    let wanted = standalone || known.is_some() || source.contains("pending=\"shape\"");
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
        standalone,
    };
    let import_lines = if standalone {
        HashMap::new()
    } else {
        imported_variants(&mut g, program, filename, known)
    };

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
        let param = c
            .params
            .items
            .first()
            .map(|p| g.pattern(&p.pattern))
            .unwrap_or_default();
        let param = if standalone { String::new() } else { param };
        let Some(body) = g.body(c.statements, c.expression, &mut allowed) else {
            continue;
        };
        let _ = writeln!(code, "function {}$shape({param}) {{ {body} }}", c.local);
        for e in &c.exported {
            let _ = writeln!(code, "export {{ {}$shape as {e}$shape }};", c.local);
            exports.push(e.clone());
        }
    }
    if standalone {
        drop(comps);
        program.body.clear();
        return Shapes {
            code: format!(
                "import {{ shapeAny as $$sa, shapeRead as $$sr, shapeText as $$st }} from \"@weft-js/core/shape\";\n{code}"
            ),
            exports,
        };
    }
    let mut find = FindSites {
        g: &mut g,
        out: &mut code,
        sites: Sites {
            pending: Vec::new(),
        },
    };
    find.visit_program(program);
    let sites = find.sites.pending;
    drop(comps);
    Replace {
        allocator,
        pending: &sites,
    }
    .visit_program(program);

    if code.is_empty() {
        return Shapes { code, exports };
    }
    let mut head = String::from(
        "import { shapeAny as $$sa, shapeRead as $$sr, shapeText as $$st } from \"@weft-js/core/shape\";\n",
    );
    for s in &g.used {
        head.push_str(&import_lines[s]);
    }
    Shapes {
        code: head + &code,
        exports,
    }
}

fn imported_variants(
    g: &mut Gen<'_>,
    program: &Program<'_>,
    filename: &str,
    known: Option<&HashMap<String, bool>>,
) -> HashMap<SymbolId, String> {
    let mut import_lines = HashMap::new();
    for stmt in &program.body {
        let Statement::ImportDeclaration(d) = stmt else {
            continue;
        };
        let from = d.source.value.as_str();
        for spec in d.specifiers.iter().flatten() {
            let (sym, imported) = match spec {
                ImportDeclarationSpecifier::ImportSpecifier(s) => {
                    (s.local.symbol_id.get(), s.imported.name().to_string())
                }
                ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => {
                    (s.local.symbol_id.get(), "default".to_string())
                }
                ImportDeclarationSpecifier::ImportNamespaceSpecifier(_) => continue,
            };
            let Some(sym) = sym else { continue };
            if from == "@weft-js/core/text" && imported == "Text" {
                g.text = Some(sym);
            } else if from == "@weft-js/core" {
                g.weft.insert(sym, imported);
            } else if from.starts_with('.')
                && known.is_some_and(|k| {
                    k.contains_key(&format!(
                        "{}#{imported}",
                        crate::style::resolve(filename, from)
                    ))
                })
            {
                let local = spec.local().name.to_string();
                let tag = format!(
                    "{}{local}$$v",
                    if is_component_name(&local) { "" } else { "V" }
                );
                g.variants.insert(sym, tag.clone());
                g.imports.insert(sym, tag.clone());
                import_lines.insert(
                    sym,
                    format!("import {{ {imported}$shape as {tag} }} from {from:?};\n"),
                );
            }
        }
    }

    import_lines
}
