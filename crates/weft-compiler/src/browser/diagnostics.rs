//! Check browser calls and subscription diagnostics.

use oxc_ast::ast::{
    Argument, AssignmentOperator, AssignmentTarget, BindingPattern, CallExpression, Expression,
    IdentifierReference, ObjectPropertyKind,
};
use oxc_semantic::SymbolId;
use oxc_span::{GetSpan, Span};

use crate::diag::{Diagnostic, Edit, Fix, Severity};

use super::{Checker, GLOBALS, Role, VALUES, call_name, single_expression};

impl Checker<'_> {
    /// W050: raw listeners and intervals, recorded on the enclosing component and judged when it ends.
    pub(super) fn raw(&mut self, call: &CallExpression<'_>) {
        if self.comps.is_empty() {
            return;
        }
        let Some((name, object)) = call_name(&call.callee) else {
            return;
        };
        let target = match object {
            None => None,
            Some(Expression::Identifier(id)) if GLOBALS.contains(&id.name.as_str()) => {
                Some(id.name.as_str())
            }
            Some(o) => Some(self.text(o.span())),
        };
        let args = &call.arguments;
        let owned = self.ownership() == Role::Owned;
        match name {
            "addEventListener" if args.len() >= 2 => {
                let target = target.unwrap_or("window").to_string();
                let ty = self.text(args[0].span()).to_string();
                let all = Span::new(args[0].span().start, args[args.len() - 1].span().end);
                let fix = (owned && args.len() <= 3)
                    .then(|| {
                        self.fix(
                            "on",
                            call.span,
                            &format!("{target}, {}", self.text(all)),
                            format!("Listen with `on({target}, {ty}, …)` (removed with its owner)"),
                        )
                    })
                    .flatten();
                self.comp().listens.push((call.span, target, ty, fix));
            }
            "removeEventListener" if !args.is_empty() => {
                let target = target.unwrap_or("window").to_string();
                let ty = self.text(args[0].span()).to_string();
                self.comp().removes.insert((target, ty));
            }
            "setInterval" if object.is_none() || target.is_some_and(|t| GLOBALS.contains(&t)) => {
                let fix = (owned
                    && args.len() == 2
                    && !args.iter().any(|a| matches!(a, Argument::SpreadElement(_))))
                .then(|| {
                    self.fix(
                        "interval",
                        call.span,
                        &format!(
                            "{}, {}",
                            self.text(args[1].span()),
                            self.text(args[0].span())
                        ),
                        "Use `interval(ms, fn)` (cleared with its owner)".into(),
                    )
                })
                .flatten();
                self.comp().intervals.push((call.span, fix));
            }
            "clearInterval" => self.comp().clears = true,
            "close" if object.is_some() => self.comp().closes = true,
            _ => {}
        }
    }

    /// W051 and W054 on a call of a @weft-js/core/browser export.
    pub(super) fn browser_call(&mut self, call: &CallExpression<'_>, name: &str) {
        if let Role::Unowned(why) = self.ownership() {
            let what = if VALUES.contains(&name) {
                "value"
            } else if name == "on" {
                "listener"
            } else {
                "interval"
            };
            self.out.push(Diagnostic::new(
                self.source,
                "W051",
                Severity::Error,
                (call.span.start, call.span.end),
                format!("`{name}(…)` is created {why}, where there is no owner: nothing removes this {what}."),
                "Create it in a component's setup (or a `defineState` setup), or inside `createRoot(dispose => …)` and call `dispose` when done.",
            ));
        }
        if name == "media" && self.ssr != Some(false) {
            self.w054(call);
        }
    }

    pub(super) fn w054(&mut self, call: &CallExpression<'_>) {
        let Some(query) = call.arguments.first() else {
            return;
        };
        let edit = match call
            .arguments
            .get(1)
            .and_then(|a| a.as_expression())
            .map(oxc_ast::ast::Expression::without_parentheses)
        {
            None if call.arguments.len() == 1 => Edit {
                start: query.span().end,
                end: query.span().end,
                text: ", { ssr: false }".into(),
            },
            Some(Expression::ObjectExpression(o)) => {
                let named = |p: &ObjectPropertyKind<'_>| match p {
                    ObjectPropertyKind::ObjectProperty(p) => {
                        p.key.static_name().is_some_and(|k| k == "ssr")
                    }
                    ObjectPropertyKind::SpreadProperty(_) => true, // may carry it
                };
                if o.properties.iter().any(named) {
                    return;
                }
                match o.properties.first() {
                    Some(p) => Edit {
                        start: p.span().start,
                        end: p.span().start,
                        text: "ssr: false, ".into(),
                    },
                    None => Edit {
                        start: o.span.start,
                        end: o.span.end,
                        text: "{ ssr: false }".into(),
                    },
                }
            }
            _ => return, // options from elsewhere: can't tell
        };
        let q = self.text(query.span());
        let severity = if self.ssr == Some(true) {
            Severity::Error
        } else {
            Severity::Warning
        };
        let maybe = if self.ssr == Some(true) {
            "This file is server-rendered"
        } else {
            "If this component is server-rendered"
        };
        let d = Diagnostic::new(
            self.source,
            "W054",
            severity,
            (call.span.start, call.span.end),
            format!("`media({q})` has no `ssr` value. {maybe}, the server can't know the screen: it renders `false`, and hydration may not match the client."),
            format!("Pass what the server should render: `media({q}, {{ ssr: false }})`. The client switches to the real value right after hydrating."),
        )
        .with_fix(Fix { description: "Render it as not matching on the server (`ssr: false`)".into(), safe: false, edits: vec![edit] });
        self.out.push(d);
    }

    /// W056: `watch(() => live.value, v => { s.value = v })`.
    pub(super) fn watch_copy(&mut self, call: &CallExpression<'_>) {
        let [source, run] = call.arguments.as_slice() else {
            return;
        };
        let (Some(source), Some(run)) = (source.as_expression(), run.as_expression()) else {
            return;
        };
        let Some(Expression::StaticMemberExpression(read)) = single_expression(source) else {
            return;
        };
        let Expression::Identifier(live) = &read.object else {
            return;
        };
        if read.property.name != "value"
            || !self.symbol(live).is_some_and(|s| self.live.contains(&s))
        {
            return;
        }
        let Some(Expression::AssignmentExpression(a)) = single_expression(run) else {
            return;
        };
        let AssignmentTarget::StaticMemberExpression(target) = &a.left else {
            return;
        };
        let Expression::Identifier(boxed) = &target.object else {
            return;
        };
        let param = match run.without_parentheses() {
            Expression::ArrowFunctionExpression(f) => f.params.items.first(),
            Expression::FunctionExpression(f) => f.params.items.first(),
            _ => None,
        };
        let (name, list) = (live.name.as_str(), boxed.name.as_str());
        if target.property.name == "value"
            && self.text(a.right.span()).contains(&format!("{list}.value"))
        {
            self.out.push(Diagnostic::new(
                self.source,
                "W052",
                Severity::Error,
                (call.span.start, call.span.end),
                format!("This `watch` folds `{name}` into `{list}` by hand: `{list}` is lost when the component unmounts, and messages that arrive meanwhile are gone."),
                format!("Pass `fold` and `initial` where `{name}` is read: the fold lives in the cache and survives a remount for `keep`."),
            ));
            return;
        }
        let copies_param = matches!((param.map(|p| &p.pattern), a.right.without_parentheses()),
            (Some(BindingPattern::BindingIdentifier(p)), Expression::Identifier(r)) if p.name == r.name);
        let copies_value = self.text(a.right.span()) == self.text(read.span);
        if target.property.name != "value"
            || a.operator != AssignmentOperator::Assign
            || !(copies_param || copies_value)
        {
            return;
        }
        let (live, boxed) = (live.name.as_str(), boxed.name.as_str());
        self.out.push(Diagnostic::new(
            self.source,
            "W056",
            Severity::Warning,
            (call.span.start, call.span.end),
            format!("This `watch` copies the live value `{live}` into `{boxed}`: `{boxed}` lags a flush behind and holds a second copy that can drift."),
            format!("Read `{live}.value` where you need it, or make `{boxed}` a `derived(() => {live}.value)`."),
        ));
    }

    pub(super) fn symbol(&self, id: &IdentifierReference<'_>) -> Option<SymbolId> {
        id.reference_id
            .get()
            .and_then(|r| self.scoping.get_reference(r).symbol_id())
    }

    /// What role a function passed to `callee` runs in.
    pub(super) fn callback_role(&self, call: &CallExpression<'_>) -> Role {
        if let Some(name) = self.browser_fn(&call.callee) {
            return match name {
                "on" => Role::Unowned("in an event handler"),
                "interval" => Role::Unowned("in an `interval` callback"),
                _ => Role::Inherit,
            };
        }
        match call_name(&call.callee).map(|(n, _)| n) {
            Some(
                "setTimeout"
                | "setInterval"
                | "requestAnimationFrame"
                | "requestIdleCallback"
                | "queueMicrotask",
            ) => Role::Unowned("in a timer callback"),
            Some("then" | "catch" | "finally") => Role::Unowned("in a promise callback"),
            Some("addEventListener") => Role::Unowned("in an event listener"),
            Some(
                "createRoot"
                | "watch"
                | "onMount"
                | "derived"
                | "effect"
                | "memo"
                | "defineState"
                | "untrack"
                | "batch"
                | "provide"
                | "render"
                | "hydrate"
                | "renderToString"
                | "renderToStringAsync",
            ) => Role::Owned,
            _ => Role::Inherit,
        }
    }
}
