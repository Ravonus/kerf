//! Build AST fragments by parsing small source strings in the file's allocator, then filling named
//! placeholders with nodes moved out of the original program. Synthesized nodes are unspanned (`SPAN`), so
//! source maps and the back end's comment lookups only ever see authored positions.

use oxc_allocator::Allocator;
use oxc_ast::ast::{BindingPattern, Expression, Statement};
use oxc_ast_visit::{VisitMut, walk_mut};
use oxc_parser::Parser;
use oxc_span::{SPAN, SourceType, Span};

struct Unspan;

impl<'a> VisitMut<'a> for Unspan {
    fn visit_span(&mut self, span: &mut Span) {
        *span = SPAN;
    }
}

pub fn expr<'a>(allocator: &'a Allocator, text: &str) -> Expression<'a> {
    let text = allocator.alloc_str(text);
    let mut expression = Parser::new(allocator, text, SourceType::tsx())
        .parse_expression()
        .unwrap_or_else(|errors| panic!("weft snippet `{text}` failed to parse: {errors:?}"));
    Unspan.visit_expression(&mut expression);
    expression
}

pub fn statement<'a>(allocator: &'a Allocator, text: &str) -> Statement<'a> {
    let text = allocator.alloc_str(text);
    let mut program = Parser::new(allocator, text, SourceType::tsx()).parse().program;
    Unspan.visit_program(&mut program);
    program.body.pop().expect("snippet statement")
}

/// A binding pattern for a single parameter, e.g. `props`.
pub fn param_pattern<'a>(allocator: &'a Allocator, name: &str) -> BindingPattern<'a> {
    match expr(allocator, &format!("({name}) => 0")) {
        Expression::ArrowFunctionExpression(mut arrow) => {
            let param = arrow.params.items.pop().expect("one param");
            param.pattern
        }
        _ => unreachable!(),
    }
}

/// Replace each identifier named like a key in `slots` with its node.
pub fn fill<'a>(target: &mut Expression<'a>, slots: Vec<(&'static str, Expression<'a>)>) {
    let mut filler = Fill { slots };
    filler.visit_expression(target);
    debug_assert!(filler.slots.is_empty(), "unfilled snippet slots");
}

struct Fill<'a> {
    slots: Vec<(&'static str, Expression<'a>)>,
}

impl<'a> VisitMut<'a> for Fill<'a> {
    fn visit_expression(&mut self, it: &mut Expression<'a>) {
        if let Expression::Identifier(id) = it {
            if let Some(i) = self.slots.iter().position(|(name, _)| id.name.as_str() == *name) {
                *it = self.slots.swap_remove(i).1;
                return;
            }
        }
        walk_mut::walk_expression(self, it);
    }
}
