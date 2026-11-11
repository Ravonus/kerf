//! Track browser ownership and component context.

use oxc_ast::ast::Expression;
use oxc_span::Span;

use crate::diag::{Diagnostic, Edit, Fix, Severity};

use super::{Checker, Comp, FnCtx, MODULE, Role, is_component_name};

impl<'s> Checker<'s> {
    pub(super) fn text(&self, span: Span) -> &'s str {
        &self.source[span.start as usize..span.end as usize]
    }

    /// The @kerf/core/browser export this callee is, if it is one.
    pub(super) fn browser_fn(&self, callee: &Expression<'_>) -> Option<&str> {
        let Expression::Identifier(id) = callee.without_parentheses() else {
            return None;
        };
        let sym = id
            .reference_id
            .get()
            .and_then(|r| self.scoping.get_reference(r).symbol_id())?;
        self.imports.get(&sym).map(|(name, _)| name.as_str())
    }

    /// Owned, unowned (with why), or unknown, for code at the current position.
    pub(super) fn ownership(&self) -> Role {
        for f in self.fns.iter().rev() {
            if f.awaited {
                return Role::Unowned("after `await`");
            }
            if f.role != Role::Inherit {
                return f.role;
            }
        }
        Role::Unowned("at module scope")
    }

    /// The local name to call @kerf/core/browser's `name` by, and the import edit it needs; `None` when the name is taken.
    pub(super) fn browser_name(&self, name: &str) -> Option<(String, Option<Edit>)> {
        if let Some((_, local)) = self.imports.values().find(|(n, _)| n == name) {
            return Some((local.clone(), None));
        }
        if self.bound.contains_key(name) {
            return None;
        }
        let edit = match (self.browser_import, self.last_import) {
            (Some(at), _) => Edit {
                start: at,
                end: at,
                text: format!(", {name}"),
            },
            (None, Some(at)) => Edit {
                start: at,
                end: at,
                text: format!("\nimport {{ {name} }} from '{MODULE}'"),
            },
            (None, None) => Edit {
                start: 0,
                end: 0,
                text: format!("import {{ {name} }} from '{MODULE}'\n"),
            },
        };
        Some((name.to_string(), Some(edit)))
    }

    pub(super) fn fix(
        &self,
        name: &str,
        call: Span,
        args: &str,
        description: String,
    ) -> Option<Fix> {
        let (local, import) = self.browser_name(name)?;
        let mut edits = vec![Edit {
            start: call.start,
            end: call.end,
            text: format!("{local}({args})"),
        }];
        edits.extend(import);
        Some(Fix {
            description,
            safe: false,
            edits,
        })
    }

    pub(super) fn enter_fn(&mut self, role: Role, component: bool, f: impl FnOnce(&mut Self)) {
        if component {
            self.comps.push(Comp::default());
        } else if let Some(c) = self.comps.last_mut() {
            c.fn_depth += 1;
        }
        self.fns.push(FnCtx {
            role,
            awaited: false,
        });
        f(self);
        self.fns.pop();
        if component {
            let c = self
                .comps
                .pop()
                .expect("pushed above, and `f` leaves the stack as it found it");
            self.finish_component(c);
        } else if let Some(c) = self.comps.last_mut() {
            c.fn_depth -= 1;
        }
    }

    pub(super) fn role_for(&mut self, name: Option<String>) -> (Role, bool) {
        if let Some(role) = self.next_role.take() {
            return (role, false);
        }
        match name {
            Some(n) if is_component_name(&n) => (Role::Owned, true),
            _ => (Role::Unknown, false),
        }
    }

    pub(super) fn finish_component(&mut self, c: Comp) {
        for (span, target, ty, fix) in c.listens {
            if c.removes.contains(&(target.clone(), ty.clone())) {
                continue;
            }
            let mut d = Diagnostic::new(
                self.source,
                "W050",
                Severity::Error,
                (span.start, span.end),
                format!(
                    "`{target}.addEventListener({ty}, …)` in a component is never removed: it outlives the component and fires after it unmounts."
                ),
                format!(
                    "Use `on({target}, {ty}, …)` from @kerf/core/browser: its owner removes it. Or remove it in `onCleanup`."
                ),
            );
            if let Some(f) = fix {
                d = d.with_fix(f);
            }
            self.out.push(d);
        }
        if !c.clears {
            for (span, fix) in c.intervals {
                let mut d = Diagnostic::new(
                    self.source,
                    "W050",
                    Severity::Error,
                    (span.start, span.end),
                    "`setInterval` in a component is never cleared: it keeps running after the component unmounts.",
                    "Use `interval(ms, fn)` from @kerf/core/browser: its owner clears it. Or `clearInterval` in `onCleanup`.",
                );
                if let Some(f) = fix {
                    d = d.with_fix(f);
                }
                self.out.push(d);
            }
        }
        if !c.closes {
            for (span, kind) in c.sockets {
                self.out.push(Diagnostic::new(
                    self.source,
                    "W050",
                    Severity::Error,
                    (span.start, span.end),
                    format!("`new {kind}(…)` in a component is never closed: the connection outlives the component."),
                    "Close it in `onCleanup(() => socket.close())`. kerf's `stream` (Phase 3) and `channel` (Phase 3b) replace raw sockets.",
                ));
            }
        }
    }

    pub(super) fn comp(&mut self) -> &mut Comp {
        self.comps
            .last_mut()
            .expect("`raw` returns when no component encloses the call")
    }
}
