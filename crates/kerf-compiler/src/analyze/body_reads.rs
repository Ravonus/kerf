//! Diagnostics for component-body reads, bindings, and props.

use oxc_ast::ast::{
    CallExpression, Expression, IdentifierReference, JSXAttribute, JSXAttributeItem,
    JSXAttributeName, JSXAttributeValue,
};
use oxc_ast_visit::Visit;
use oxc_span::{GetSpan, Span};

use crate::diag::{Diagnostic, Edit, Fix, Severity};

use super::{Analyzer, Reactive, chain_root_member, key, symbol_of};

impl Analyzer<'_> {
    pub(super) fn report_body_read(&mut self, span: Span, what: &str) {
        let Some(ctx) = self.body_level() else { return };
        if let Some(call) = ctx.state_arg {
            let arg = self.text(span);
            let inner = &self.source[call.start as usize..call.end as usize];
            let arg_text = inner
                .strip_prefix("state(")
                .and_then(|s| s.strip_suffix(')'))
                .unwrap_or(arg);
            let d = Diagnostic::new(
                self.source,
                "W005",
                Severity::Error,
                (span.start, span.end),
                format!("`state({arg_text})` copies `{arg_text}` once; later changes are ignored."),
                "Use `state.linked(() => …)` to reset when it changes, or `untrack()` if a snapshot is intended.",
            );
            let fix = Fix {
                description: "Make it a linked state that resets when the prop changes".into(),
                safe: false,
                edits: vec![Edit {
                    start: call.start,
                    end: call.end,
                    text: format!("state.linked(() => {arg_text})"),
                }],
            };
            self.plan.diagnostics.push(d.with_fix(fix));
            return;
        }
        let decl = ctx.body_decl;
        if let Some(d) = decl
            && self
                .comps
                .last_mut()
                .is_some_and(|c| !c.reported_decls.insert(key(d)))
        {
            return;
        }
        let mut d = Diagnostic::new(
            self.source,
            "W001",
            Severity::Error,
            (span.start, span.end),
            format!("`{what}` is read once when the component is set up, so this never updates."),
            "`const x = props.y` stays live on its own, but this does more than name a prop: wrap it in `derived(() => …)`, move it into `watch`, or use `untrack()` if a snapshot is intended.",
        );
        if let Some(init) = decl {
            let text = self.text(init);
            d = d.with_fix(Fix {
                description: "Make it a derived value (then read it with `.value`)".into(),
                safe: false,
                edits: vec![Edit {
                    start: init.start,
                    end: init.end,
                    text: format!("derived(() => {text})"),
                }],
            });
        }
        self.plan.diagnostics.push(d);
    }

    /// W015: `{count}` where `count` is a box renders the box, not its value.
    pub(super) fn bare_box(&mut self, id: &IdentifierReference<'_>) {
        if !symbol_of(self.scoping, id).is_some_and(|s| self.boxes.contains(&s)) {
            return;
        }
        let name = id.name.as_str();
        let d = Diagnostic::new(
            self.source,
            "W015",
            Severity::Error,
            (id.span.start, id.span.end),
            format!("`{name}` is a box; JSX needs its value."),
            format!("Read `{name}.value`."),
        )
        .with_fix(Fix {
            description: format!("Read `{name}.value`"),
            safe: true,
            edits: vec![Edit {
                start: id.span.end,
                end: id.span.end,
                text: ".value".into(),
            }],
        });
        self.plan.diagnostics.push(d);
    }

    /// `<Card person={bind(name)} />`: the one way a child's write reaches the parent.
    pub(super) fn bound_prop(&mut self, attr: &JSXAttribute<'_>) {
        let Some(JSXAttributeValue::ExpressionContainer(c)) = &attr.value else {
            return;
        };
        let Some(Expression::CallExpression(call)) = c
            .expression
            .as_expression()
            .map(oxc_ast::ast::Expression::get_inner_expression)
        else {
            return;
        };
        if self.is_bind(call)
            && let [arg] = call.arguments.as_slice()
            && arg.as_expression().is_some_and(|e| {
                chain_root_member(e).is_some()
                    || matches!(e.get_inner_expression(), Expression::Identifier(_))
            })
        {
            self.plan.bound.insert(key(call.span));
        }
    }

    /// `bind:count={box}`: only on a component, and only with something that can be a box.
    pub(super) fn bound_attribute(&mut self, attr: &JSXAttributeItem<'_>, intrinsic: bool) {
        let JSXAttributeItem::Attribute(a) = attr else {
            return;
        };
        let JSXAttributeName::NamespacedName(ns) = &a.name else {
            return;
        };
        if ns.namespace.name != "bind" {
            return;
        }
        let value = match &a.value {
            Some(JSXAttributeValue::ExpressionContainer(c)) => c.expression.as_expression(),
            _ => None,
        };
        let path = value.is_some_and(|e| {
            chain_root_member(e).is_some()
                || matches!(e.get_inner_expression(), Expression::Identifier(_))
        });
        if intrinsic || !path {
            self.plan.diagnostics.push(Diagnostic::new(
                self.source,
                "W061",
                Severity::Error,
                (a.span.start, a.span.end),
                "`bind:` takes a box, on a component.",
                "Write `<Card bind:person={name} />`, with `name` a box. A form element takes `value` and `onChange`.",
            ));
        }
    }

    pub(super) fn is_bind(&self, call: &CallExpression<'_>) -> bool {
        let Expression::Identifier(id) = &call.callee else {
            return false;
        };
        symbol_of(self.scoping, id)
            .and_then(|s| self.imports.get(&s))
            .is_some_and(|(from, name)| from == "@kerf-js/core" && name == "bind")
    }

    /// W016: `<App api={createFakeApi()} />`. A component prop compiles to a getter, so a call in it runs again on
    /// every read and each read gets a new value. Calls that read props, list items or boxes are meant to stay
    /// live and are left alone; the compiler can't see inside the callee, so it reports instead of hoisting.
    pub(super) fn call_prop(&mut self, attr: &JSXAttribute<'_>, component: &str) {
        let Some(JSXAttributeValue::ExpressionContainer(c)) = &attr.value else {
            return;
        };
        let Some(value) = c.expression.as_expression() else {
            return;
        };
        // Only calls: the back end treats `new X()` as static and passes its value once.
        let Expression::CallExpression(call) = value.without_parentheses() else {
            return;
        };
        let (callee, span) = (&call.callee, call.span);
        let mut reactive = Reactive {
            a: self,
            found: false,
        };
        reactive.visit_expression(value);
        if reactive.found {
            return;
        }
        let JSXAttributeName::Identifier(name) = &attr.name else {
            return;
        };
        let (name, call, callee) = (
            name.name.as_str(),
            self.text(span),
            self.text(callee.span()),
        );
        self.plan.diagnostics.push(Diagnostic::new(
            self.source,
            "W016",
            Severity::Warning,
            (span.start, span.end),
            format!(
                "`<{component} {name}={{{call}}}>`: props are live getters, so `{callee}` runs again on every read of \
                 `{name}` and each read gets a new value."
            ),
            format!(
                "Create it once outside the JSX (`const {name} = {call}`) and pass `{name}={{{name}}}`. If `{callee}` \
                 reads state and should re-run, keep it."
            ),
        ));
    }

    pub(super) fn bind_call_diagnostic(&mut self, it: &CallExpression<'_>) {
        if self.is_bind(it) && !self.plan.bound.contains(&key(it.span)) {
            self.plan.diagnostics.push(Diagnostic::new(
                self.source,
                "W061",
                Severity::Error,
                (it.span.start, it.span.end),
                "`bind(box)` only means something as a component prop's whole value.",
                "Write `<Card person={bind(name)} />`, with `name` a box. A form element takes `value` and `onChange`.",
            ));
        }
    }
}
