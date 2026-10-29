//! Apply the plan to the AST: props become live reads (§3.3), JSX `.map` becomes a keyed list (§3.4).
//!
//! `({ a, b = 1, ...rest }) => …`  →  `(props) => …` with `a` → `props.a`, `b` → `(props.b === undefined ? 1 : props.b)`,
//! `rest` → `omit(props, ["a", "b"])`.
//! `{xs.map(x => <Row key={x.id} x={x} />)}`  →  `<For each={xs} by={(x) => x.id}>{x => <Row x={x()} />}</For>`.

use std::collections::HashSet;

use oxc_allocator::{Allocator, TakeIn};
use oxc_ast::ast::*;
use oxc_ast_visit::{VisitMut, walk_mut};
use oxc_semantic::{Scoping, SymbolId};
use oxc_span::GetSpan;
use oxc_syntax::scope::ScopeFlags;

use crate::analyze::{Plan, Rewrite, SpanKey, is_key_attr, key};
use crate::snippet;

pub fn apply<'a>(allocator: &'a Allocator, program: &mut Program<'a>, scoping: &Scoping, plan: &Plan, source: &str) {
    let mut t = Transformer { allocator, scoping, plan, source, raw: HashSet::new() };
    t.visit_program(program);
    if plan.needs_omit {
        program.body.insert(0, snippet::statement(allocator, "import { omit as _$omit } from \"weft\";"));
    }
}

struct Transformer<'a, 'p> {
    allocator: &'a Allocator,
    scoping: &'p Scoping,
    plan: &'p Plan,
    source: &'p str,
    /// Item symbols kept as raw values (inside a list's `by` function).
    raw: HashSet<SymbolId>,
}

impl<'a, 'p> Transformer<'a, 'p> {
    fn rewrite_of(&self, id: &IdentifierReference<'a>) -> Option<&'p Rewrite> {
        let sym = id.reference_id.get().and_then(|r| self.scoping.get_reference(r).symbol_id())?;
        if self.raw.contains(&sym) {
            return None;
        }
        self.plan.rewrites.get(&sym)
    }

    fn rewritten(&self, id: &IdentifierReference<'a>) -> Option<Expression<'a>> {
        let text = match self.rewrite_of(id)? {
            Rewrite::Prop { props, path, default } => {
                let read = format!("{props}.{}", path.join("."));
                match default {
                    Some((s, e)) => {
                        let fallback = &self.source[*s as usize..*e as usize];
                        format!("({read} === undefined ? ({fallback}) : {read})")
                    }
                    None => read,
                }
            }
            Rewrite::Rest { props, exclude } => {
                let keys: Vec<String> = exclude.iter().map(|k| format!("{k:?}")).collect();
                format!("_$omit({props}, [{}])", keys.join(", "))
            }
            Rewrite::Accessor => format!("{}()", id.name),
            Rewrite::AccessorMember { key } => format!("_item().{key}"),
        };
        Some(snippet::expr(self.allocator, &text))
    }

    fn is_list(&self, e: &Expression<'a>) -> bool {
        matches!(e, Expression::CallExpression(c) if self.plan.lists.contains_key(&key(c.span)))
    }

    fn lower_list(&mut self, it: &mut Expression<'a>) {
        let Expression::CallExpression(call) = it else { unreachable!() };
        let plan = &self.plan.lists[&key(call.span)];
        let Expression::StaticMemberExpression(member) = &mut call.callee else { unreachable!() };
        let mut each = member.object.take_in(&self.allocator);
        self.visit_expression(&mut each);
        let mut row = call.arguments[0].to_expression_mut().take_in(&self.allocator);
        let mut by = plan.key_attr.and_then(|span| take_key(self.allocator, &mut row, span));
        if let Some(by) = by.as_mut() {
            self.raw.extend(plan.item_syms.iter().copied());
            self.visit_expression(by);
            for s in &plan.item_syms {
                self.raw.remove(s);
            }
        }
        self.visit_expression(&mut row);
        let param = plan.item_param.map_or("_", |(s, e)| &self.source[s as usize..e as usize]);
        let mut list = match by {
            Some(by) => {
                let mut list = snippet::expr(
                    self.allocator,
                    &format!("<For each={{$each}} by={{({param}) => $by}}>{{$row}}</For>"),
                );
                snippet::fill(&mut list, vec![("$each", each), ("$by", by), ("$row", row)]);
                list
            }
            None => {
                let mut list = snippet::expr(self.allocator, "<For each={$each}>{$row}</For>");
                snippet::fill(&mut list, vec![("$each", each), ("$row", row)]);
                list
            }
        };
        std::mem::swap(it, &mut list);
    }

    fn replace_first_param(&self, params: &mut FormalParameters<'a>, span: SpanKey) {
        let name = if let Some(props) = self.plan.components.get(&span) {
            props.as_str()
        } else if self.plan.destructured_rows.contains(&span) {
            "_item"
        } else {
            return;
        };
        if let Some(first) = params.items.first_mut() {
            first.pattern = snippet::param_pattern(self.allocator, name);
        }
    }
}

/// Remove the `key` attribute from the row callback's root element and return its expression.
fn take_key<'a>(allocator: &'a Allocator, row: &mut Expression<'a>, span: SpanKey) -> Option<Expression<'a>> {
    let returned: &mut Expression<'a> = match row {
        Expression::ArrowFunctionExpression(f) => match &mut f.body {
            ArrowFunctionBody::FunctionBody(body) => last_return(&mut body.statements)?,
            body => body.as_expression_mut()?,
        },
        Expression::FunctionExpression(f) => last_return(&mut f.body.as_mut()?.statements)?,
        _ => return None,
    };
    let Expression::JSXElement(el) = returned.without_parentheses_mut() else { return None };
    let attrs = &mut el.opening_element.attributes;
    let index = attrs.iter().position(|a| is_key_attr(a) && key(a.span()) == span)?;
    let JSXAttributeItem::Attribute(mut attr) = attrs.remove(index) else { return None };
    match attr.value.as_mut()? {
        JSXAttributeValue::ExpressionContainer(c) => c.expression.as_expression_mut().map(|e| e.take_in(&allocator)),
        JSXAttributeValue::StringLiteral(s) => Some(snippet::expr(allocator, &format!("{:?}", s.value.as_str()))),
        _ => None,
    }
}

fn last_return<'b, 'a>(statements: &'b mut oxc_allocator::Vec<'a, Statement<'a>>) -> Option<&'b mut Expression<'a>> {
    match statements.last_mut()? {
        Statement::ReturnStatement(r) => r.argument.as_mut(),
        _ => None,
    }
}

impl<'a, 'p> VisitMut<'a> for Transformer<'a, 'p> {
    fn visit_expression(&mut self, it: &mut Expression<'a>) {
        if let Expression::Identifier(id) = it
            && let Some(new) = self.rewritten(id)
        {
            *it = new;
            return;
        }
        if self.is_list(it) {
            self.lower_list(it);
            return;
        }
        walk_mut::walk_expression(self, it);
    }

    fn visit_jsx_child(&mut self, it: &mut JSXChild<'a>) {
        if let JSXChild::ExpressionContainer(c) = it
            && let Some(e) = c.expression.as_expression_mut()
            && self.is_list(e)
        {
            self.lower_list(e);
            if let Expression::JSXElement(el) = e.take_in(&self.allocator) {
                *it = JSXChild::Element(el);
            }
            return;
        }
        walk_mut::walk_jsx_child(self, it);
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
        self.replace_first_param(&mut it.params, key(it.span));
        walk_mut::walk_function(self, it, flags);
    }

    fn visit_arrow_function_expression(&mut self, it: &mut ArrowFunctionExpression<'a>) {
        self.replace_first_param(&mut it.params, key(it.span));
        walk_mut::walk_arrow_function_expression(self, it);
    }
}
