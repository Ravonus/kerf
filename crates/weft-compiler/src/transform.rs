//! Apply the plan to the AST: props become live reads (§3.3), JSX `.map` becomes a keyed list (§3.4).
//!
//! `({ a, b = a, ...rest }) => …`  →  `(props) => …` with `a` → `props.a`, `b` → `(props.b === undefined ? props.a : props.b)`,
//! `rest` → `_rest`, declared once as `const _rest = omit(props, ["a", "b"])`; `rest.x` → `props.x`;
//! `<div {...rest}>` → `<div {...restOf(props, ["a", "b"])}>`, a plain copy read where the element's spread reads it.
//! `({ children }) => …`  →  `const _children = memo(() => props.children)` and `children` → `_children()`.
//! `{xs.map(x => <Row key={x.id} x={x} />)}`  →  `<For each={xs} by={(x) => x.id}>{x => <Row x={x()} />}</For>`.
//! `{xs?.map(…)}` is the same list: `For` renders a nullish `each` as empty.
//!
//! New nodes are built directly in the file's allocator, around nodes moved out of the original program, so moved
//! code keeps its spans and reference IDs and is rewritten like any other code. Synthesized nodes are unspanned
//! (`SPAN`), so source maps and the back end's comment lookups only ever see authored positions.

mod components;
mod lists;
mod nodes;
mod rewrites;
mod visitor;

use std::collections::{HashMap, HashSet};

use oxc_allocator::{Allocator, TakeIn, Vec as ArenaVec};
use oxc_ast::ast::{
    ArrowFunctionBody, Expression, FormalParameter, JSXAttributeItem, JSXAttributeValue, JSXChild,
    JSXElement, Program, Statement,
};
use oxc_ast::builder::AstBuilder;
use oxc_ast_visit::VisitMut;
use oxc_semantic::{Scoping, SymbolId};
use oxc_span::{GetSpan, SPAN, Span};

use crate::analyze::{Plan, SpanKey, is_key_attr, key};

pub fn apply<'a>(
    allocator: &'a Allocator,
    program: &mut Program<'a>,
    scoping: &Scoping,
    plan: &Plan,
) {
    let mut t = Transformer {
        allocator,
        ast: AstBuilder::new(allocator),
        scoping,
        plan,
        raw: HashSet::new(),
        defaults: HashMap::new(),
        local: plan
            .local_props
            .values()
            .flat_map(|(_, keys)| keys.iter().map(|(_, s)| *s))
            .collect(),
        needs_local: false,
        children_used: HashSet::new(),
        rest_used: HashSet::new(),
        needs_memo: false,
        needs_rest_of: false,
    };
    t.visit_program(program);
    let mut imports = Vec::new();
    if !t.rest_used.is_empty() {
        imports.push(("omit", "_$omit"));
    }
    let mut internal = Vec::new();
    if t.needs_rest_of {
        internal.push(("restOf", "_$restOf"));
    }
    if t.needs_local {
        internal.push(("localProps", "_$localProps"));
    }
    if t.needs_memo {
        imports.push(("memo", "_$weftMemo"));
    }
    for (module, names) in [("@weft-js/core", imports), ("@weft-js/core/internal", internal)] {
        if !names.is_empty() {
            program.body.insert(0, t.import(module, &names));
        }
    }
}

struct Transformer<'a, 'p> {
    allocator: &'a Allocator,
    ast: AstBuilder<'a>,
    scoping: &'p Scoping,
    plan: &'p Plan,
    /// Prop locals that are written: their default is applied by `localProps`, once.
    local: HashSet<SymbolId>,
    needs_local: bool,
    /// Item symbols kept as raw values (inside a list's `by` function).
    raw: HashSet<SymbolId>,
    /// Prop defaults moved out of the destructuring pattern, already rewritten; cloned into every read.
    defaults: HashMap<SymbolId, Expression<'a>>,
    /// Components whose memoised children are read.
    children_used: HashSet<SpanKey>,
    /// Components whose rest parameter is held as a value (its `omit` view is declared).
    rest_used: HashSet<SpanKey>,
    needs_memo: bool,
    needs_rest_of: bool,
}

fn has_optional_link(e: &Expression<'_>) -> bool {
    match e {
        Expression::CallExpression(c) => c.optional || has_optional_link(&c.callee),
        Expression::StaticMemberExpression(m) => m.optional || has_optional_link(&m.object),
        Expression::ComputedMemberExpression(m) => m.optional || has_optional_link(&m.object),
        Expression::PrivateFieldExpression(m) => m.optional || has_optional_link(&m.object),
        Expression::TSNonNullExpression(n) => has_optional_link(&n.expression),
        _ => false,
    }
}

fn row_params<'b, 'a>(row: &'b Expression<'a>) -> &'b [FormalParameter<'a>] {
    match row {
        Expression::ArrowFunctionExpression(f) => &f.params.items,
        Expression::FunctionExpression(f) => &f.params.items,
        _ => &[],
    }
}

/// Remove the `key` attributes from the row's roots and return the first one's expression.
fn take_keys<'a>(
    t: &Transformer<'a, '_>,
    row: &mut Expression<'a>,
    spans: &[SpanKey],
) -> Option<Expression<'a>> {
    let first = *spans.first()?;
    let returned: &mut Expression<'a> = match row {
        Expression::ArrowFunctionExpression(f) => match &mut f.body {
            ArrowFunctionBody::FunctionBody(body) => last_return(&mut body.statements)?,
            body => body.as_expression_mut()?,
        },
        Expression::FunctionExpression(f) => last_return(&mut f.body.as_mut()?.statements)?,
        _ => return None,
    };
    let mut by = None;
    strip_keys(t, returned, spans, first, &mut by);
    by
}

fn strip_keys<'a>(
    t: &Transformer<'a, '_>,
    e: &mut Expression<'a>,
    spans: &[SpanKey],
    first: SpanKey,
    by: &mut Option<Expression<'a>>,
) {
    match e.without_parentheses_mut() {
        Expression::JSXElement(el) => strip_element(t, el, spans, first, by),
        Expression::JSXFragment(f) => {
            for child in &mut f.children {
                match child {
                    JSXChild::Element(el) => strip_element(t, el, spans, first, by),
                    JSXChild::ExpressionContainer(c) => {
                        if let Some(e) = c.expression.as_expression_mut() {
                            strip_keys(t, e, spans, first, by);
                        }
                    }
                    _ => {}
                }
            }
        }
        Expression::ConditionalExpression(c) => {
            strip_keys(t, &mut c.consequent, spans, first, by);
            strip_keys(t, &mut c.alternate, spans, first, by);
        }
        Expression::LogicalExpression(l) => strip_keys(t, &mut l.right, spans, first, by),
        _ => {}
    }
}

fn strip_element<'a>(
    t: &Transformer<'a, '_>,
    el: &mut JSXElement<'a>,
    spans: &[SpanKey],
    first: SpanKey,
    by: &mut Option<Expression<'a>>,
) {
    let attrs = &mut el.opening_element.attributes;
    while let Some(index) = attrs
        .iter()
        .position(|a| is_key_attr(a) && spans.contains(&key(a.span())))
    {
        let JSXAttributeItem::Attribute(mut attr) = attrs.remove(index) else {
            continue;
        };
        if key(attr.span) != first {
            continue;
        }
        *by = match attr.value.as_mut() {
            Some(JSXAttributeValue::ExpressionContainer(c)) => {
                c.expression.as_expression_mut().map(|e| e.take_in(&t.ast))
            }
            Some(JSXAttributeValue::StringLiteral(s)) => Some(t.string(s.value.as_str())),
            _ => None,
        };
    }
}

fn last_return<'b, 'a>(
    statements: &'b mut ArenaVec<'a, Statement<'a>>,
) -> Option<&'b mut Expression<'a>> {
    match statements.last_mut()? {
        Statement::ReturnStatement(r) => r.argument.as_mut(),
        _ => None,
    }
}

struct Unspan;

impl VisitMut<'_> for Unspan {
    fn visit_span(&mut self, span: &mut Span) {
        *span = SPAN;
    }
}
