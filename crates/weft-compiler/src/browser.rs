//! Browser events and subscriptions (PLAN §4.2, research 07 §9.3): W050–W052, W054, W056. Its own read-only pass
//! over the program, after `analyze`.
//!
//! - W050: a raw `addEventListener`, `setInterval`, `new WebSocket` or `new EventSource` in a component with no
//!   matching cleanup. Listeners and intervals in an owned place get an edit to `on`/`interval` (weft/browser).
//! - W051: a weft/browser value, listener or interval created where there is no owner: module scope, a timer, a
//!   promise callback, an event handler, or after `await`.
//! - W052: `watch(() => tick.value, m => { list.value = [...list.value, m] })`: a stream folded by hand into a
//!   component's `state`, which is lost when the component unmounts (the v3 bug). A stream is a call of something
//!   imported from a server module.
//! - W054: `media(q)` without `ssr` in a file that is server-rendered. `online`, `visible` and `lifecycle` have
//!   server values that match a first paint (`true`, `true`, `'active'`); a media query has none.
//! - W056: `watch(() => live.value, v => { s.value = v })`: a live value copied into state.

use std::collections::{HashMap, HashSet};

use oxc_ast::ast::*;
use oxc_ast_visit::{Visit, walk};
use oxc_semantic::{Scoping, SymbolId};
use oxc_span::{GetSpan, Span};
use oxc_syntax::scope::ScopeFlags;

use crate::diag::{Diagnostic, Edit, Fix, Severity};

pub const MODULE: &str = "weft/browser";
const VALUES: [&str; 4] = ["online", "visible", "lifecycle", "media"];

/// Whether the file is server-rendered, for W054: `Some(true)` for SSR and hydratable output, `None` when only
/// checking (it may be), `Some(false)` for a client-only build.
pub type Ssr = Option<bool>;

/// Local bindings of weft/browser's values (`online`, `visible`, `lifecycle`, `media`): their results are boxes.
pub fn value_imports(program: &Program<'_>) -> HashSet<SymbolId> {
    imports(program).into_iter().filter(|(_, (name, _))| VALUES.contains(&name.as_str())).map(|(s, _)| s).collect()
}

/// weft/browser import bindings: symbol → (imported name, local name).
fn imports(program: &Program<'_>) -> HashMap<SymbolId, (String, String)> {
    let mut out = HashMap::new();
    for stmt in &program.body {
        let Statement::ImportDeclaration(d) = stmt else {
            continue;
        };
        if d.source.value != MODULE {
            continue;
        }
        for spec in d.specifiers.iter().flatten() {
            if let ImportDeclarationSpecifier::ImportSpecifier(s) = spec
                && let Some(sym) = s.local.symbol_id.get()
            {
                out.insert(sym, (s.imported.name().to_string(), s.local.name.to_string()));
            }
        }
    }
    out
}

pub fn check(program: &Program<'_>, scoping: &Scoping, source: &str, ssr: Ssr) -> Vec<Diagnostic> {
    let imports = imports(program);
    let mut bound = Bound(HashMap::new());
    bound.visit_program(program);
    let mut last_import = None;
    let mut browser_import = None;
    let mut server_imports = HashSet::new();
    for stmt in &program.body {
        if let Statement::ImportDeclaration(d) = stmt {
            last_import = Some(d.span.end);
            let from = d.source.value.as_str();
            if d.import_kind.is_value() && (from.contains("/server/") || from.contains(".server")) {
                for s in d.specifiers.iter().flatten() {
                    let local = match s {
                        ImportDeclarationSpecifier::ImportSpecifier(s) => &s.local,
                        ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => &s.local,
                        ImportDeclarationSpecifier::ImportNamespaceSpecifier(s) => &s.local,
                    };
                    if let Some(sym) = local.symbol_id.get() {
                        server_imports.insert(sym);
                    }
                }
            }
            if d.source.value == MODULE && d.import_kind.is_value() {
                let last =
                    d.specifiers.iter().flatten().filter(|s| matches!(s, ImportDeclarationSpecifier::ImportSpecifier(_))).last();
                if let Some(s) = last {
                    browser_import = Some(s.span().end);
                }
            }
        }
    }
    let mut c = Checker {
        scoping,
        source,
        ssr,
        imports,
        bound: bound.0,
        last_import,
        browser_import,
        live: HashSet::new(),
        server_imports,
        fns: Vec::new(),
        next_role: None,
        pending_name: None,
        comps: Vec::new(),
        out: Vec::new(),
    };
    c.visit_program(program);
    c.out
}

/// Every binding name in the file and how often it is bound, to tell whether `on`/`interval` is free for a fix.
struct Bound(HashMap<String, u32>);

impl<'a> Visit<'a> for Bound {
    fn visit_binding_identifier(&mut self, it: &BindingIdentifier<'a>) {
        *self.0.entry(it.name.to_string()).or_default() += 1;
    }
}

/// Whether code in a function runs with an owner.
#[derive(Clone, Copy, PartialEq)]
enum Role {
    /// A component body, or a callback weft runs under an owner (`createRoot`, `watch`, `onMount`, `derived` …).
    Owned,
    /// Runs later with no owner: the reason is in the message.
    Unowned(&'static str),
    /// A plain function: who calls it decides.
    Unknown,
    /// An inline callback to some other call (`xs.forEach(…)`): runs where its caller does.
    Inherit,
}

struct FnCtx {
    role: Role,
    /// An `await` has run in this function, so what follows has lost its owner.
    awaited: bool,
}

#[derive(Default)]
struct Comp {
    fn_depth: usize,
    /// `addEventListener` calls: (call span, target text, type text, the fix).
    listens: Vec<(Span, String, String, Option<Fix>)>,
    removes: HashSet<(String, String)>,
    intervals: Vec<(Span, Option<Fix>)>,
    clears: bool,
    sockets: Vec<(Span, String)>,
    closes: bool,
}

struct Checker<'s> {
    scoping: &'s Scoping,
    source: &'s str,
    ssr: Ssr,
    imports: HashMap<SymbolId, (String, String)>,
    bound: HashMap<String, u32>,
    last_import: Option<u32>,
    /// The end of the last specifier of a weft/browser import, where a fix adds a name.
    browser_import: Option<u32>,
    /// Symbols holding a live value: a weft/browser value, or `query.live(…)`.
    live: HashSet<SymbolId>,
    /// Bindings imported from a server module: calling one in a component reads a query or a stream.
    server_imports: HashSet<SymbolId>,
    fns: Vec<FnCtx>,
    next_role: Option<Role>,
    pending_name: Option<String>,
    comps: Vec<Comp>,
    out: Vec<Diagnostic>,
}

fn is_component_name(name: &str) -> bool {
    name.starts_with(|c: char| c.is_ascii_uppercase())
}

fn is_fn(e: &Expression<'_>) -> bool {
    matches!(e.without_parentheses(), Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_))
}

/// `setTimeout` and `window.setTimeout` → `setTimeout`; `x.then` → `then`.
fn call_name<'b, 'a>(callee: &'b Expression<'a>) -> Option<(&'b str, Option<&'b Expression<'a>>)> {
    match callee.without_parentheses() {
        Expression::Identifier(id) => Some((id.name.as_str(), None)),
        Expression::StaticMemberExpression(m) => Some((m.property.name.as_str(), Some(&m.object))),
        _ => None,
    }
}

const GLOBALS: [&str; 4] = ["window", "globalThis", "self", "document"];

impl<'s> Checker<'s> {
    fn text(&self, span: Span) -> &'s str {
        &self.source[span.start as usize..span.end as usize]
    }

    /// The weft/browser export this callee is, if it is one.
    fn browser_fn(&self, callee: &Expression<'_>) -> Option<&str> {
        let Expression::Identifier(id) = callee.without_parentheses() else {
            return None;
        };
        let sym = id.reference_id.get().and_then(|r| self.scoping.get_reference(r).symbol_id())?;
        self.imports.get(&sym).map(|(name, _)| name.as_str())
    }

    /// Owned, unowned (with why), or unknown, for code at the current position.
    fn ownership(&self) -> Role {
        for f in self.fns.iter().rev() {
            if f.awaited {
                return Role::Unowned("after `await`");
            }
            match f.role {
                Role::Inherit => continue,
                r => return r,
            }
        }
        Role::Unowned("at module scope")
    }

    /// The local name to call weft/browser's `name` by, and the import edit it needs; `None` when the name is taken.
    fn browser_name(&self, name: &str) -> Option<(String, Option<Edit>)> {
        if let Some((_, local)) = self.imports.values().find(|(n, _)| n == name) {
            return Some((local.clone(), None));
        }
        if self.bound.contains_key(name) {
            return None;
        }
        let edit = match (self.browser_import, self.last_import) {
            (Some(at), _) => Edit { start: at, end: at, text: format!(", {name}") },
            (None, Some(at)) => Edit { start: at, end: at, text: format!("\nimport {{ {name} }} from '{MODULE}'") },
            (None, None) => Edit { start: 0, end: 0, text: format!("import {{ {name} }} from '{MODULE}'\n") },
        };
        Some((name.to_string(), Some(edit)))
    }

    fn fix(&self, name: &str, call: Span, args: String, description: String) -> Option<Fix> {
        let (local, import) = self.browser_name(name)?;
        let mut edits = vec![Edit { start: call.start, end: call.end, text: format!("{local}({args})") }];
        edits.extend(import);
        Some(Fix { description, safe: false, edits })
    }

    fn enter_fn(&mut self, role: Role, component: bool, f: impl FnOnce(&mut Self)) {
        if component {
            self.comps.push(Comp::default());
        } else if let Some(c) = self.comps.last_mut() {
            c.fn_depth += 1;
        }
        self.fns.push(FnCtx { role, awaited: false });
        f(self);
        self.fns.pop();
        if component {
            let c = self.comps.pop().unwrap();
            self.finish_component(c);
        } else if let Some(c) = self.comps.last_mut() {
            c.fn_depth -= 1;
        }
    }

    fn role_for(&mut self, name: Option<String>) -> (Role, bool) {
        if let Some(role) = self.next_role.take() {
            return (role, false);
        }
        match name {
            Some(n) if is_component_name(&n) => (Role::Owned, true),
            _ => (Role::Unknown, false),
        }
    }

    fn finish_component(&mut self, c: Comp) {
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
                format!("Use `on({target}, {ty}, …)` from weft/browser: its owner removes it. Or remove it in `onCleanup`."),
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
                    "Use `interval(ms, fn)` from weft/browser: its owner clears it. Or `clearInterval` in `onCleanup`.",
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
                    "Close it in `onCleanup(() => socket.close())`. weft's `stream` (Phase 3) and `channel` (Phase 3b) replace raw sockets.",
                ));
            }
        }
    }

    /// W050: raw listeners and intervals, recorded on the enclosing component and judged when it ends.
    fn raw(&mut self, call: &CallExpression<'_>) {
        if self.comps.is_empty() {
            return;
        }
        let Some((name, object)) = call_name(&call.callee) else {
            return;
        };
        let target = match object {
            None => None,
            Some(Expression::Identifier(id)) if GLOBALS.contains(&id.name.as_str()) => Some(id.name.as_str()),
            Some(o) => Some(self.text(o.span())),
        };
        let args = &call.arguments;
        let arg = |i: usize| args.get(i).map(|a| self.text(a.span()));
        let owned = self.ownership() == Role::Owned;
        match name {
            "addEventListener" if args.len() >= 2 => {
                let target = target.unwrap_or("window").to_string();
                let ty = arg(0).unwrap().to_string();
                let all = Span::new(args[0].span().start, args[args.len() - 1].span().end);
                let fix = (owned && args.len() <= 3)
                    .then(|| {
                        self.fix(
                            "on",
                            call.span,
                            format!("{target}, {}", self.text(all)),
                            format!("Listen with `on({target}, {ty}, …)` (removed with its owner)"),
                        )
                    })
                    .flatten();
                self.comps.last_mut().unwrap().listens.push((call.span, target, ty, fix));
            }
            "removeEventListener" if !args.is_empty() => {
                let target = target.unwrap_or("window").to_string();
                let ty = arg(0).unwrap().to_string();
                self.comps.last_mut().unwrap().removes.insert((target, ty));
            }
            "setInterval" if object.is_none() || target.is_some_and(|t| GLOBALS.contains(&t)) => {
                let fix = (owned && args.len() == 2 && !args.iter().any(|a| matches!(a, Argument::SpreadElement(_))))
                    .then(|| {
                        self.fix(
                            "interval",
                            call.span,
                            format!("{}, {}", arg(1).unwrap(), arg(0).unwrap()),
                            "Use `interval(ms, fn)` (cleared with its owner)".into(),
                        )
                    })
                    .flatten();
                self.comps.last_mut().unwrap().intervals.push((call.span, fix));
            }
            "clearInterval" => self.comps.last_mut().unwrap().clears = true,
            "close" if object.is_some() => self.comps.last_mut().unwrap().closes = true,
            _ => {}
        }
    }

    /// W051 and W054 on a call of a weft/browser export.
    fn browser_call(&mut self, call: &CallExpression<'_>, name: &str) {
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

    fn w054(&mut self, call: &CallExpression<'_>) {
        let Some(query) = call.arguments.first() else {
            return;
        };
        let edit = match call.arguments.get(1).and_then(|a| a.as_expression()).map(|e| e.without_parentheses()) {
            None if call.arguments.len() == 1 => {
                Edit { start: query.span().end, end: query.span().end, text: ", { ssr: false }".into() }
            }
            Some(Expression::ObjectExpression(o)) => {
                let named = |p: &ObjectPropertyKind<'_>| match p {
                    ObjectPropertyKind::ObjectProperty(p) => p.key.static_name().is_some_and(|k| k == "ssr"),
                    ObjectPropertyKind::SpreadProperty(_) => true, // may carry it
                };
                if o.properties.iter().any(named) {
                    return;
                }
                match o.properties.first() {
                    Some(p) => Edit { start: p.span().start, end: p.span().start, text: "ssr: false, ".into() },
                    None => Edit { start: o.span.start, end: o.span.end, text: "{ ssr: false }".into() },
                }
            }
            _ => return, // options from elsewhere: can't tell
        };
        let q = self.text(query.span());
        let severity = if self.ssr == Some(true) { Severity::Error } else { Severity::Warning };
        let maybe = if self.ssr == Some(true) { "This file is server-rendered" } else { "If this component is server-rendered" };
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
    fn watch_copy(&mut self, call: &CallExpression<'_>) {
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
        if read.property.name != "value" || !self.symbol(live).is_some_and(|s| self.live.contains(&s)) {
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
        if target.property.name == "value" && self.text(a.right.span()).contains(&format!("{list}.value")) {
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
        if target.property.name != "value" || a.operator != AssignmentOperator::Assign || !(copies_param || copies_value) {
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

    fn symbol(&self, id: &IdentifierReference<'_>) -> Option<SymbolId> {
        id.reference_id.get().and_then(|r| self.scoping.get_reference(r).symbol_id())
    }

    /// What role a function passed to `callee` runs in.
    fn callback_role(&self, call: &CallExpression<'_>) -> Role {
        if let Some(name) = self.browser_fn(&call.callee) {
            return match name {
                "on" => Role::Unowned("in an event handler"),
                "interval" => Role::Unowned("in an `interval` callback"),
                _ => Role::Inherit,
            };
        }
        match call_name(&call.callee).map(|(n, _)| n) {
            Some("setTimeout" | "setInterval" | "requestAnimationFrame" | "requestIdleCallback" | "queueMicrotask") => {
                Role::Unowned("in a timer callback")
            }
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

/// The one expression a function returns: `() => x`, `() => { return x }` or `() => { x }`.
fn single_expression<'b, 'a>(f: &'b Expression<'a>) -> Option<&'b Expression<'a>> {
    let statements = match f.without_parentheses() {
        Expression::ArrowFunctionExpression(f) => match &f.body {
            ArrowFunctionBody::FunctionBody(body) => &body.statements,
            body => return body.as_expression().map(|e| e.without_parentheses()),
        },
        Expression::FunctionExpression(f) => &f.body.as_ref()?.statements,
        _ => return None,
    };
    match statements.as_slice() {
        [Statement::ExpressionStatement(s)] => Some(s.expression.without_parentheses()),
        [Statement::ReturnStatement(r)] => r.argument.as_ref().map(|e| e.without_parentheses()),
        _ => None,
    }
}

impl<'a, 's> Visit<'a> for Checker<'s> {
    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        if let BindingPattern::BindingIdentifier(id) = &it.id
            && let Some(init) = it.init.as_ref().map(|e| e.without_parentheses())
        {
            if is_fn(init) {
                self.pending_name = Some(id.name.to_string());
            }
            if let Expression::CallExpression(c) = init {
                let live = self.browser_fn(&c.callee).is_some_and(|n| VALUES.contains(&n))
                    || matches!(&c.callee, Expression::StaticMemberExpression(m) if m.property.name == "live")
                    || matches!(&c.callee, Expression::Identifier(f) if self.symbol(f).is_some_and(|s| self.server_imports.contains(&s)));
                if live && let Some(sym) = id.symbol_id.get() {
                    self.live.insert(sym);
                }
            }
        }
        walk::walk_variable_declarator(self, it);
        self.pending_name = None;
    }

    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        let name = it.id.as_ref().map(|i| i.name.to_string()).or_else(|| self.pending_name.take());
        let (role, component) = self.role_for(name);
        self.enter_fn(role, component && it.body.is_some(), |s| walk::walk_function(s, it, flags));
    }

    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        let name = self.pending_name.take();
        let (role, component) = self.role_for(name);
        self.enter_fn(role, component, |s| walk::walk_arrow_function_expression(s, it));
    }

    fn visit_await_expression(&mut self, it: &AwaitExpression<'a>) {
        walk::walk_await_expression(self, it);
        if let Some(f) = self.fns.last_mut() {
            f.awaited = true;
        }
    }

    fn visit_jsx_attribute(&mut self, it: &JSXAttribute<'a>) {
        let handler = matches!(&it.name, JSXAttributeName::Identifier(n)
            if n.name.len() > 2 && n.name.starts_with("on") && n.name.as_bytes()[2].is_ascii_uppercase());
        if handler
            && let Some(JSXAttributeValue::ExpressionContainer(c)) = &it.value
            && c.expression.as_expression().is_some_and(is_fn)
        {
            self.next_role = Some(Role::Unowned("in an event handler"));
        }
        walk::walk_jsx_attribute(self, it);
        self.next_role = None;
    }

    fn visit_new_expression(&mut self, it: &NewExpression<'a>) {
        if let Expression::Identifier(id) = &it.callee
            && matches!(id.name.as_str(), "WebSocket" | "EventSource")
            && let Some(c) = self.comps.last_mut()
        {
            c.sockets.push((it.span, id.name.to_string()));
        }
        walk::walk_new_expression(self, it);
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        self.raw(it);
        if let Some(name) = self.browser_fn(&it.callee).map(String::from) {
            self.browser_call(it, &name);
        }
        if matches!(&it.callee, Expression::Identifier(id) if id.name == "watch") {
            self.watch_copy(it);
        }
        let role = self.callback_role(it);
        self.visit_expression(&it.callee);
        for arg in &it.arguments {
            if arg.as_expression().is_some_and(is_fn) {
                self.next_role = Some(role);
            }
            self.visit_argument(arg);
            self.next_role = None;
        }
    }
}
