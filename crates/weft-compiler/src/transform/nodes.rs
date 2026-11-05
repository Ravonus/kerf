//! Build syntax nodes for the analysis transform.

use oxc_allocator::Vec as ArenaVec;
use oxc_ast::ast::{
    Argument, ArrowFunctionBody, BindingIdentifier, BindingPattern, Expression, FormalParameter,
    FormalParameterKind, FormalParameters, IdentifierName, ImportDeclarationSpecifier,
    ImportOrExportKind, JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXExpression,
    ModuleExportName, NumberBase, Statement, StringLiteral, VariableDeclarationKind,
    VariableDeclarator,
};
use oxc_span::SPAN;

use super::Transformer;

impl<'a> Transformer<'a, '_> {
    pub(super) fn str(&self, s: &str) -> &'a str {
        self.allocator.alloc_str(s)
    }

    pub(super) fn ident(&self, name: &str) -> Expression<'a> {
        Expression::new_identifier(SPAN, self.str(name), &self.ast)
    }

    pub(super) fn member(&self, object: Expression<'a>, property: &str) -> Expression<'a> {
        let property = IdentifierName::new(SPAN, self.str(property), &self.ast);
        Expression::new_static_member_expression(SPAN, object, property, false, &self.ast)
    }

    pub(super) fn call(
        &self,
        callee: Expression<'a>,
        args: impl IntoIterator<Item = Expression<'a>>,
    ) -> Expression<'a> {
        let args = ArenaVec::from_iter_in(args.into_iter().map(Argument::from), &self.ast);
        Expression::new_call_expression(SPAN, callee, None, args, false, &self.ast)
    }

    pub(super) fn number(&self, value: u32) -> Expression<'a> {
        Expression::new_numeric_literal(
            SPAN,
            f64::from(value),
            None,
            NumberBase::Decimal,
            &self.ast,
        )
    }

    pub(super) fn string(&self, value: &str) -> Expression<'a> {
        Expression::new_string_literal(SPAN, self.str(value), None, &self.ast)
    }

    pub(super) fn arrow(
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

    pub(super) fn binding(&self, name: &str) -> BindingPattern<'a> {
        BindingPattern::new_binding_identifier(SPAN, self.str(name), &self.ast)
    }

    pub(super) fn jsx_attr(&self, name: &str, value: Expression<'a>) -> JSXAttributeItem<'a> {
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

    pub(super) fn const_decl(&self, name: &str, init: Expression<'a>) -> Statement<'a> {
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

    pub(super) fn import(&self, source: &str, names: &[(&str, &str)]) -> Statement<'a> {
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
