//! Loose for hydration.

use super::{
    ArrowFunctionExpression, BindingIdentifier, BindingPattern, CallExpression,
    ExportDefaultDeclaration, ExportDefaultDeclarationKind, ExportSpecifier, Expression, Function,
    HashSet, IdentifierReference, JSXClosingElement, JSXElement, JSXElementName, JSXFragment,
    JSXMemberExpressionObject, NewExpression, ReferenceId, Scoping, TSType,
    TaggedTemplateExpression, ThisExpression, VariableDeclarator, Visit, add, walk,
};

/// The references that name a tag, by themselves.
#[derive(Default)]
pub(super) struct TagRefs(pub(super) HashSet<ReferenceId>);

impl<'a> Visit<'a> for TagRefs {
    fn visit_jsx_element_name(&mut self, it: &JSXElementName<'a>) {
        let id = match it {
            JSXElementName::IdentifierReference(id) => id,
            JSXElementName::MemberExpression(m) => match &m.object {
                JSXMemberExpressionObject::IdentifierReference(id) => id,
                _ => return,
            },
            _ => return,
        };
        self.0.extend(id.reference_id.get());
    }
}

/// The module-level names read as values. What a call, a function or JSX reads is one; what a binding holds isn't until
/// that binding is: a local that's only ever a tag (`const Tag = TAGS[as]`) ends in a tag, and a module-level value is
/// followed from wherever it's read (`hydration.mjs`).
pub(super) struct Loose<'s> {
    pub(super) scoping: &'s Scoping,
    pub(super) tags: HashSet<ReferenceId>,
    pub(super) held: bool,
    pub(super) out: Vec<String>,
}

impl Loose<'_> {
    fn free(&mut self, f: impl FnOnce(&mut Self)) {
        let held = std::mem::replace(&mut self.held, false);
        f(self);
        self.held = held;
    }

    fn holder(&self, id: &BindingIdentifier<'_>) -> bool {
        let sym = id.symbol_id();
        self.scoping.symbol_scope_id(sym) == self.scoping.root_scope_id()
            || (!self.scoping.symbol_is_mutated(sym)
                && self
                    .scoping
                    .get_resolved_reference_ids(sym)
                    .iter()
                    .all(|r| self.tags.contains(r)))
    }
}

impl<'a> Visit<'a> for Loose<'_> {
    fn visit_ts_type(&mut self, _: &TSType<'a>) {}
    fn visit_jsx_element_name(&mut self, _: &JSXElementName<'a>) {}
    fn visit_jsx_closing_element(&mut self, _: &JSXClosingElement<'a>) {}
    fn visit_export_specifier(&mut self, _: &ExportSpecifier<'a>) {}

    fn visit_export_default_declaration(&mut self, it: &ExportDefaultDeclaration<'a>) {
        if !matches!(it.declaration, ExportDefaultDeclarationKind::Identifier(_)) {
            walk::walk_export_default_declaration(self, it);
        }
    }

    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        let Some(sym) = it
            .reference_id
            .get()
            .and_then(|r| self.scoping.get_reference(r).symbol_id())
        else {
            return;
        };
        if !self.held && self.scoping.symbol_scope_id(sym) == self.scoping.root_scope_id() {
            add(&mut self.out, it.name.to_string());
        }
    }

    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        match (&it.id, &it.init) {
            (BindingPattern::BindingIdentifier(id), Some(init))
                if self.holder(id) && !reads_this(init) =>
            {
                let held = std::mem::replace(&mut self.held, true);
                self.visit_expression(init);
                self.held = held;
            }
            _ => self.free(|l| walk::walk_variable_declarator(l, it)),
        }
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        self.free(|l| walk::walk_call_expression(l, it));
    }

    fn visit_new_expression(&mut self, it: &NewExpression<'a>) {
        self.free(|l| walk::walk_new_expression(l, it));
    }

    fn visit_tagged_template_expression(&mut self, it: &TaggedTemplateExpression<'a>) {
        self.free(|l| walk::walk_tagged_template_expression(l, it));
    }

    fn visit_function(&mut self, it: &Function<'a>, flags: oxc_syntax::scope::ScopeFlags) {
        self.free(|l| walk::walk_function(l, it, flags));
    }

    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        self.free(|l| walk::walk_arrow_function_expression(l, it));
    }

    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        self.free(|l| walk::walk_jsx_element(l, it));
    }

    fn visit_jsx_fragment(&mut self, it: &JSXFragment<'a>) {
        self.free(|l| walk::walk_jsx_fragment(l, it));
    }
}

/// A table's own method can call what the table holds, and only `this` says so.
fn reads_this(e: &Expression<'_>) -> bool {
    #[derive(Default)]
    struct This(bool);
    impl Visit<'_> for This {
        fn visit_this_expression(&mut self, _: &ThisExpression) {
            self.0 = true;
        }
    }
    let mut t = This::default();
    t.visit_expression(e);
    t.0
}

pub(super) fn hatch(source: &str, from: u32, to: u32) -> Option<String> {
    let text = source.get(from as usize..to as usize)?;
    if text.contains("@kerf client") {
        Some("client".into())
    } else if text.contains("@kerf static") {
        Some("static".into())
    } else if text.contains("@kerf visible") {
        Some("visible".into())
    } else if text.contains("@kerf interaction") {
        Some("interaction".into())
    } else {
        None
    }
}
