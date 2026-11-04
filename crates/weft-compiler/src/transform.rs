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

use std::collections::{HashMap, HashSet};

use oxc_allocator::{Allocator, CloneIn, TakeIn, Vec as ArenaVec};
use oxc_ast::ast::{
    Argument, ArrayExpressionElement, ArrowFunctionBody, ArrowFunctionExpression,
    AssignmentOperator, AssignmentTarget, BindingIdentifier, BindingPattern, ChainElement,
    Expression, FormalParameter, FormalParameterKind, FormalParameters, Function, FunctionBody,
    IdentifierName, IdentifierReference, ImportDeclarationSpecifier, ImportOrExportKind,
    JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXChild, JSXClosingElement, JSXElement,
    JSXElementName, JSXExpression, JSXMemberExpression, JSXMemberExpressionObject,
    JSXOpeningElement, ModuleExportName, NumberBase, ObjectProperty, Program,
    SimpleAssignmentTarget, Statement, StringLiteral, VariableDeclarationKind, VariableDeclarator,
};
use oxc_ast::builder::AstBuilder;
use oxc_ast_visit::{VisitMut, walk_mut};
use oxc_semantic::{Scoping, SymbolId};
use oxc_span::{GetSpan, SPAN, Span};
use oxc_syntax::operator::BinaryOperator;
use oxc_syntax::scope::ScopeFlags;

use crate::analyze::{Plan, Rewrite, RowStep, SpanKey, is_key_attr, key};
use crate::emit::TAG;

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
    if t.needs_rest_of {
        imports.push(("restOf", "_$restOf"));
    }
    if t.needs_local {
        imports.push(("localProps", "_$localProps"));
    }
    if t.needs_memo {
        imports.push(("memo", "_$weftMemo"));
    }
    if !imports.is_empty() {
        program.body.insert(0, t.import("@weft-js/core", &imports));
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

/// Node constructors.
impl<'a> Transformer<'a, '_> {
    fn str(&self, s: &str) -> &'a str {
        self.allocator.alloc_str(s)
    }

    fn ident(&self, name: &str) -> Expression<'a> {
        Expression::new_identifier(SPAN, self.str(name), &self.ast)
    }

    fn member(&self, object: Expression<'a>, property: &str) -> Expression<'a> {
        let property = IdentifierName::new(SPAN, self.str(property), &self.ast);
        Expression::new_static_member_expression(SPAN, object, property, false, &self.ast)
    }

    fn call(
        &self,
        callee: Expression<'a>,
        args: impl IntoIterator<Item = Expression<'a>>,
    ) -> Expression<'a> {
        let args = ArenaVec::from_iter_in(args.into_iter().map(Argument::from), &self.ast);
        Expression::new_call_expression(SPAN, callee, None, args, false, &self.ast)
    }

    fn number(&self, value: u32) -> Expression<'a> {
        Expression::new_numeric_literal(
            SPAN,
            f64::from(value),
            None,
            NumberBase::Decimal,
            &self.ast,
        )
    }

    fn string(&self, value: &str) -> Expression<'a> {
        Expression::new_string_literal(SPAN, self.str(value), None, &self.ast)
    }

    fn arrow(
        &self,
        params: impl IntoIterator<Item = BindingPattern<'a>>,
        body: Expression<'a>,
    ) -> Expression<'a> {
        let items = params.into_iter().map(|pattern| {
            FormalParameter::new(
                SPAN,
                ArenaVec::new_in(&self.ast),
                pattern,
                None,
                None,
                false,
                None,
                false,
                false,
                &self.ast,
            )
        });
        let params = FormalParameters::boxed(
            SPAN,
            FormalParameterKind::ArrowFormalParameters,
            ArenaVec::from_iter_in(items, &self.ast),
            None,
            &self.ast,
        );
        Expression::new_arrow_function_expression(
            SPAN,
            false,
            None,
            params,
            None,
            ArrowFunctionBody::from(body),
            &self.ast,
        )
    }

    fn binding(&self, name: &str) -> BindingPattern<'a> {
        BindingPattern::new_binding_identifier(SPAN, self.str(name), &self.ast)
    }

    fn jsx_attr(&self, name: &str, value: Expression<'a>) -> JSXAttributeItem<'a> {
        let value = JSXAttributeValue::new_expression_container(
            SPAN,
            JSXExpression::from(value),
            &self.ast,
        );
        JSXAttributeItem::new_attribute(
            SPAN,
            JSXAttributeName::new_identifier(SPAN, self.str(name), &self.ast),
            Some(value),
            &self.ast,
        )
    }

    fn const_decl(&self, name: &str, init: Expression<'a>) -> Statement<'a> {
        let declarator =
            VariableDeclarator::new(SPAN, self.binding(name), None, Some(init), false, &self.ast);
        let declarations = ArenaVec::from_iter_in([declarator], &self.ast);
        Statement::new_variable_declaration(
            SPAN,
            VariableDeclarationKind::Const,
            declarations,
            false,
            &self.ast,
        )
    }

    fn import(&self, source: &str, names: &[(&str, &str)]) -> Statement<'a> {
        let specifiers = names.iter().map(|(imported, local)| {
            ImportDeclarationSpecifier::new_import_specifier(
                SPAN,
                ModuleExportName::new_identifier_name(SPAN, self.str(imported), &self.ast),
                BindingIdentifier::new(SPAN, self.str(local), &self.ast),
                ImportOrExportKind::Value,
                &self.ast,
            )
        });
        let source = StringLiteral::new(SPAN, self.str(source), None, &self.ast);
        let specifiers = Some(ArenaVec::from_iter_in(specifiers, &self.ast));
        Statement::new_import_declaration(
            SPAN,
            specifiers,
            source,
            None,
            None,
            ImportOrExportKind::Value,
            &self.ast,
        )
    }
}

impl<'a, 'p> Transformer<'a, 'p> {
    fn rewrite_of(&self, id: &IdentifierReference<'a>) -> Option<(SymbolId, &'p Rewrite)> {
        let sym = id
            .reference_id
            .get()
            .and_then(|r| self.scoping.get_reference(r).symbol_id())?;
        if self.raw.contains(&sym) {
            return None;
        }
        self.plan.rewrites.get(&sym).map(|r| (sym, r))
    }

    /// The live read that replaces `original` (an identifier bound to `sym`).
    fn rewritten(
        &mut self,
        sym: SymbolId,
        rewrite: &Rewrite,
        original: Expression<'a>,
    ) -> Expression<'a> {
        match rewrite {
            Rewrite::Prop { props, path } => {
                let read = || {
                    path.iter()
                        .fold(self.ident(props), |object, p| self.member(object, p))
                };
                match self
                    .defaults
                    .get(&sym)
                    .filter(|_| !self.local.contains(&sym))
                {
                    Some(fallback) => {
                        let fallback = fallback.clone_in(self.allocator);
                        let undefined = self.ident("undefined");
                        let test = Expression::new_binary_expression(
                            SPAN,
                            read(),
                            BinaryOperator::StrictEquality,
                            undefined,
                            &self.ast,
                        );
                        let pick = Expression::new_conditional_expression(
                            SPAN,
                            test,
                            fallback,
                            read(),
                            &self.ast,
                        );
                        Expression::new_parenthesized_expression(SPAN, pick, &self.ast)
                    }
                    None => read(),
                }
            }
            Rewrite::Via { of, path } => {
                let plan = self.plan;
                let (undefined, target) = (self.ident("undefined"), &plan.rewrites[of]);
                let base = self.rewritten(*of, target, undefined);
                path.iter().fold(base, |object, p| self.member(object, p))
            }
            Rewrite::Children { local, component } => {
                self.children_used.insert(*component);
                self.call(self.ident(local), [])
            }
            Rewrite::Rest {
                local, component, ..
            } => {
                self.rest_used.insert(*component);
                self.ident(local)
            }
            // The identifier itself becomes the callee, so it keeps its span and reference.
            Rewrite::Accessor => self.call(original, []),
            Rewrite::AccessorPath { path } => {
                path.iter()
                    .fold(self.call(self.ident("_item"), []), |at, step| match step {
                        RowStep::Key(key) => self.member(at, key),
                        RowStep::Index(index) => Expression::new_computed_member_expression(
                            SPAN,
                            at,
                            self.number(*index),
                            false,
                            &self.ast,
                        ),
                        RowStep::From(index) => {
                            self.call(self.member(at, "slice"), [self.number(*index)])
                        }
                    })
            }
        }
    }

    /// `<helper>(props, ["a", "b"])` for a rest parameter.
    fn rest_call(&self, helper: &str, props: &str, exclude: &[String]) -> Expression<'a> {
        let keys = exclude
            .iter()
            .map(|k| ArrayExpressionElement::from(self.string(k)));
        let keys = Expression::new_array_expression(
            SPAN,
            ArenaVec::from_iter_in(keys, &self.ast),
            &self.ast,
        );
        self.call(self.ident(helper), [self.ident(props), keys])
    }

    /// The rest parameter `e` names, if it is one.
    fn rest_of(&self, e: &Expression<'a>) -> Option<&'p Rewrite> {
        let Expression::Identifier(id) = e else {
            return None;
        };
        self.rewrite_of(id)
            .map(|(_, r)| r)
            .filter(|r| matches!(r, Rewrite::Rest { .. }))
    }

    /// The live read of a component tag whose root name is rewritten: `<g.meta.icon />` → `g().meta.icon`.
    fn tag_read(&mut self, name: &JSXElementName<'a>) -> Option<Expression<'a>> {
        match name {
            JSXElementName::IdentifierReference(id) => self.tag_root(id),
            JSXElementName::MemberExpression(m) => self.tag_member(m),
            _ => None,
        }
    }

    fn tag_member(&mut self, m: &JSXMemberExpression<'a>) -> Option<Expression<'a>> {
        let object = match &m.object {
            JSXMemberExpressionObject::IdentifierReference(id) => self.tag_root(id),
            JSXMemberExpressionObject::MemberExpression(m) => self.tag_member(m),
            JSXMemberExpressionObject::ThisExpression(_) => None,
        }?;
        Some(self.member(object, m.property.name.as_str()))
    }

    fn tag_root(&mut self, id: &IdentifierReference<'a>) -> Option<Expression<'a>> {
        let (sym, rewrite) = self.rewrite_of(id)?;
        let original = self.ident(id.name.as_str());
        Some(self.rewritten(sym, rewrite, original))
    }

    fn is_list(&self, e: &Expression<'a>) -> bool {
        let call = match e {
            Expression::CallExpression(c) => c,
            Expression::ChainExpression(c) => match &c.expression {
                ChainElement::CallExpression(c) => c,
                _ => return false,
            },
            _ => return false,
        };
        self.plan.lists.contains_key(&key(call.span))
    }

    fn lower_list(&mut self, it: &mut Expression<'a>) {
        let call = match it {
            Expression::CallExpression(c) => c,
            Expression::ChainExpression(c) => match &mut c.expression {
                ChainElement::CallExpression(c) => c,
                _ => unreachable!(),
            },
            _ => unreachable!(),
        };
        let plan = &self.plan.lists[&key(call.span)];
        let Expression::StaticMemberExpression(member) = &mut call.callee else {
            unreachable!()
        };
        let mut each = member.object.take_in(&self.ast);
        self.visit_expression(&mut each);
        let each = self.rechained(each);
        let mut row = call.arguments[0].to_expression_mut().take_in(&self.ast);
        // The `by` function reuses the row's item and index patterns, taken before the row's own parameters are
        // rewritten (`key={i}` keys by position).
        let mut params: Vec<_> = row_params(&row)
            .iter()
            .take(2)
            .map(|p| p.pattern.clone_in(self.allocator))
            .collect();
        if params.is_empty() {
            params.push(self.binding("_"));
        }
        let mut by = take_keys(self, &mut row, &plan.key_attrs);
        if let Some(by) = by.as_mut() {
            self.raw.extend(plan.item_syms.iter().copied());
            self.visit_expression(by);
            for s in &plan.item_syms {
                self.raw.remove(s);
            }
        }
        self.visit_expression(&mut row);
        let mut attrs = vec![self.jsx_attr("each", each)];
        if let Some(by) = by {
            attrs.push(self.jsx_attr("by", self.arrow(params, by)));
        }
        let name = || JSXElementName::new_identifier_reference(SPAN, "For", &self.ast);
        let opening = JSXOpeningElement::boxed(
            SPAN,
            name(),
            None,
            ArenaVec::from_iter_in(attrs, &self.ast),
            &self.ast,
        );
        let closing = JSXClosingElement::boxed(SPAN, name(), &self.ast);
        let child = JSXChild::new_expression_container(SPAN, JSXExpression::from(row), &self.ast);
        let children = ArenaVec::from_iter_in([child], &self.ast);
        *it = Expression::new_jsx_element(SPAN, opening, children, Some(closing), &self.ast);
    }

    /// A list's receiver, cut out of `xs?.filter(f).map(…)`, keeps the `?.` links it holds: they need a chain of their own.
    fn rechained(&self, e: Expression<'a>) -> Expression<'a> {
        if !has_optional_link(&e) {
            return e;
        }
        let element = match e {
            Expression::CallExpression(c) => ChainElement::CallExpression(c),
            Expression::TSNonNullExpression(n) => ChainElement::TSNonNullExpression(n),
            e if e.is_member_expression() => ChainElement::from(e.into_member_expression()),
            e => return e,
        };
        Expression::new_chain_expression(SPAN, element, &self.ast)
    }

    /// Before walking a component: move its prop defaults out of the pattern (rewritten, in declaration order so
    /// `b = a` sees `a`'s live read), then replace the pattern with the props parameter.
    fn enter_params(&mut self, params: &mut FormalParameters<'a>, span: SpanKey) {
        let name = if let Some(props) = self.plan.components.get(&span) {
            props.as_str()
        } else if self.plan.destructured_rows.contains(&span) {
            "_item"
        } else {
            return;
        };
        let Some(first) = params.items.first_mut() else {
            return;
        };
        if self.plan.components.contains_key(&span) {
            self.take_defaults(&mut first.pattern);
        }
        first.pattern = self.binding(name);
    }

    fn take_defaults(&mut self, pattern: &mut BindingPattern<'a>) {
        let BindingPattern::ObjectPattern(obj) = pattern else {
            return;
        };
        for prop in &mut obj.properties {
            match &mut prop.value {
                BindingPattern::AssignmentPattern(ap) => {
                    let BindingPattern::BindingIdentifier(id) = &ap.left else {
                        continue;
                    };
                    let Some(sym) = id.symbol_id.get() else {
                        continue;
                    };
                    let mut fallback = ap.right.take_in(&self.ast);
                    self.visit_expression(&mut fallback);
                    Unspan.visit_expression(&mut fallback);
                    self.defaults.insert(sym, fallback);
                }
                inner @ BindingPattern::ObjectPattern(_) => self.take_defaults(inner),
                _ => {}
            }
        }
    }

    /// Whether the component declares anything at the top of its body.
    fn declares(&self, span: SpanKey) -> bool {
        self.children_used.contains(&span)
            || self.rest_used.contains(&span)
            || self.plan.local_props.contains_key(&span)
    }

    /// After walking a component: declare its memoised children and its rest view at the top of the body, if used.
    fn exit_component(&mut self, span: SpanKey, body: &mut FunctionBody<'a>) {
        if self.rest_used.contains(&span) {
            let rest = self.plan.rewrites.values().find_map(|r| match r {
                Rewrite::Rest {
                    props,
                    exclude,
                    local,
                    component,
                } if *component == span => Some((props, exclude, local)),
                _ => None,
            });
            if let Some((props, exclude, local)) = rest {
                let view = self.rest_call("_$omit", props, exclude);
                body.statements.insert(0, self.const_decl(local, view));
            }
        }
        if let Some(children) = self.plan.children.get(&span)
            && self.children_used.contains(&span)
        {
            let read = self.arrow([], self.member(self.ident(&children.props), "children"));
            let memo = self.call(self.ident("_$weftMemo"), [read]);
            body.statements
                .insert(0, self.const_decl(&children.local, memo));
            self.needs_memo = true;
        }
        // First: everything above reads the props through it.
        if let Some((props, keys)) = self.plan.local_props.get(&span) {
            let mut fields = Vec::new();
            for (k, sym) in keys {
                fields.push(self.string(k));
                fields.push(match self.defaults.get(sym) {
                    Some(f) => self.arrow([], f.clone_in(self.allocator)),
                    None => self.number(0),
                });
            }
            let items = ArenaVec::from_iter_in(
                fields.into_iter().map(ArrayExpressionElement::from),
                &self.ast,
            );
            let fallbacks = Expression::new_array_expression(SPAN, items, &self.ast);
            let view = self.call(self.ident("_$localProps"), [self.ident(props), fallbacks]);
            let target = AssignmentTarget::new_assignment_target_identifier(
                SPAN,
                self.str(props),
                &self.ast,
            );
            let assign = Expression::new_assignment_expression(
                SPAN,
                AssignmentOperator::Assign,
                target,
                view,
                &self.ast,
            );
            body.statements.insert(
                0,
                Statement::new_expression_statement(SPAN, assign, &self.ast),
            );
            self.needs_local = true;
        }
    }
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

impl<'a> VisitMut<'a> for Transformer<'a, '_> {
    /// Aliases go first, so a closure above one already reads it live, defaults included.
    fn visit_statements(&mut self, it: &mut ArenaVec<'a, Statement<'a>>) {
        let aliases = &self.plan.aliases;
        if !aliases.is_empty() {
            for statement in it.iter_mut() {
                let Statement::VariableDeclaration(d) = statement else {
                    continue;
                };
                for declarator in d
                    .declarations
                    .iter_mut()
                    .filter(|x| aliases.contains(&key(x.span)))
                {
                    self.take_defaults(&mut declarator.id);
                }
                d.declarations.retain(|x| !aliases.contains(&key(x.span)));
            }
            it.retain(
                |s| !matches!(s, Statement::VariableDeclaration(d) if d.declarations.is_empty()),
            );
        }
        walk_mut::walk_statements(self, it);
    }

    fn visit_expression(&mut self, it: &mut Expression<'a>) {
        if let Expression::Identifier(id) = it
            && let Some((sym, rewrite)) = self.rewrite_of(id)
        {
            let original = it.take_in(&self.ast);
            *it = self.rewritten(sym, rewrite, original);
            return;
        }
        // `bind(box)` as a component prop: the back end reads this name and gives the prop a setter.
        if let Expression::CallExpression(c) = it
            && self.plan.bound.contains(&key(c.span))
        {
            c.callee = self.ident("_$bound");
        }
        // `rest.x` is `props.x` (or nothing, for a key the pattern took).
        if let Expression::StaticMemberExpression(m) = it
            && let Some(Rewrite::Rest { props, exclude, .. }) = self.rest_of(&m.object)
        {
            let name = m.property.name.as_str();
            *it = if exclude.iter().any(|k| k == name) {
                self.ident("undefined")
            } else {
                self.member(self.ident(props), name)
            };
            return;
        }
        if let Expression::StaticMemberExpression(m) = it
            && let Some((local, component)) = self.plan.children_reads.get(&key(m.span))
        {
            self.children_used.insert(*component);
            *it = self.call(self.ident(local), []);
            return;
        }
        if self.is_list(it) {
            self.lower_list(it);
            return;
        }
        walk_mut::walk_expression(self, it);
    }

    fn visit_jsx_opening_element(&mut self, it: &mut JSXOpeningElement<'a>) {
        // `<div {...rest}>`: the element's spread reads every attribute anyway, so it gets a plain copy, not a view.
        if matches!(
            it.name,
            JSXElementName::Identifier(_) | JSXElementName::NamespacedName(_)
        ) {
            for attr in &mut it.attributes {
                if let JSXAttributeItem::SpreadAttribute(s) = attr
                    && let Some(Rewrite::Rest { props, exclude, .. }) = self.rest_of(&s.argument)
                {
                    s.argument = self.rest_call("_$restOf", props, exclude);
                    self.needs_rest_of = true;
                }
            }
        }
        walk_mut::walk_jsx_opening_element(self, it);
        // A tag can't hold `g()`: the read goes beside it, and the back end calls it instead of the tag's text.
        if let Some(read) = self.tag_read(&it.name) {
            it.attributes.push(self.jsx_attr(TAG, read));
        }
    }

    fn visit_jsx_child(&mut self, it: &mut JSXChild<'a>) {
        if let JSXChild::ExpressionContainer(c) = it
            && let Some(e) = c.expression.as_expression_mut()
            && self.is_list(e)
        {
            self.lower_list(e);
            if let Expression::JSXElement(el) = e.take_in(&self.ast) {
                *it = JSXChild::Element(el);
            }
            return;
        }
        walk_mut::walk_jsx_child(self, it);
    }

    /// `amount = 5` writes the prop, and `localProps` keeps it in the component.
    fn visit_simple_assignment_target(&mut self, it: &mut SimpleAssignmentTarget<'a>) {
        if let SimpleAssignmentTarget::AssignmentTargetIdentifier(id) = it
            && let Some((_, Rewrite::Prop { props, path })) = self.rewrite_of(id)
            && let Expression::StaticMemberExpression(m) = path
                .iter()
                .fold(self.ident(props), |object, p| self.member(object, p))
        {
            *it = SimpleAssignmentTarget::StaticMemberExpression(m);
            return;
        }
        walk_mut::walk_simple_assignment_target(self, it);
    }

    fn visit_object_property(&mut self, it: &mut ObjectProperty<'a>) {
        if it.shorthand
            && let Expression::Identifier(id) = &it.value
            && self.rewrite_of(id).is_some()
        {
            it.shorthand = false;
        }
        walk_mut::walk_object_property(self, it);
    }

    fn visit_function(&mut self, it: &mut Function<'a>, flags: ScopeFlags) {
        let span = key(it.span);
        self.enter_params(&mut it.params, span);
        walk_mut::walk_function(self, it, flags);
        if let Some(body) = it.body.as_mut() {
            self.exit_component(span, body);
        }
    }

    fn visit_arrow_function_expression(&mut self, it: &mut ArrowFunctionExpression<'a>) {
        let span = key(it.span);
        self.enter_params(&mut it.params, span);
        walk_mut::walk_arrow_function_expression(self, it);
        if self.declares(span) {
            // `({ children }) => <div>{children}</div>`: the memo needs a statement, so the body becomes a block.
            if let Some(e) = it.body.as_expression_mut() {
                let e = e.take_in(&self.ast);
                let ret = Statement::new_return_statement(SPAN, Some(e), &self.ast);
                let statements = ArenaVec::from_iter_in([ret], &self.ast);
                it.body = ArrowFunctionBody::FunctionBody(FunctionBody::boxed(
                    SPAN,
                    ArenaVec::new_in(&self.ast),
                    statements,
                    &self.ast,
                ));
            }
            if let ArrowFunctionBody::FunctionBody(body) = &mut it.body {
                self.exit_component(span, body);
            }
        }
    }
}
