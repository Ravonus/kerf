//! Visit for hydration.

use super::{
    BindingPattern, CallExpression, Escapes, Expression, FormalParameters, IdentifierReference,
    JSXAttribute, JSXAttributeItem, JSXAttributeValue, JSXElementName, JSXMemberExpressionObject,
    Scoping, Site, SymbolId, Visit, attr_name, is_handler,
};

#[derive(Default)]
pub(super) struct Frame {
    pub(super) uses: Vec<String>,
    pub(super) own: Option<String>,
    pub(super) passes: Option<String>,
    pub(super) early: Option<String>,
    pub(super) globals: Vec<String>,
    pub(super) calls: Vec<String>,
}

pub(super) fn add(list: &mut Vec<String>, name: String) {
    if !list.contains(&name) {
        list.push(name);
    }
}

/// Methods whose call moves the user: they can't wait, whatever island they're in.
pub(super) const MOVES: &[&str] = &[
    "focus",
    "scrollIntoView",
    "scrollTo",
    "scrollBy",
    "showModal",
    "showPopover",
    "requestFullscreen",
    "select",
];
pub(super) const WINDOW: &[&str] = &["window", "globalThis", "self"];

/// Whether a `ref`'s value calls anything. Passing the node on to the component's own `ref` prop (`ref?.(n)`,
/// `props.ref?.(n)`) isn't work here: the caller wrote that `ref`, and its call site is checked for it.
pub(super) struct Calls<'s> {
    pub(super) scoping: &'s Scoping,
    pub(super) refs: &'s [SymbolId],
    pub(super) objects: &'s [SymbolId],
    pub(super) found: bool,
}

impl Calls<'_> {
    fn holds(&self, e: &Expression<'_>, list: &[SymbolId]) -> bool {
        matches!(e.get_inner_expression(), Expression::Identifier(id) if id.reference_id.get().and_then(|r| self.scoping.get_reference(r).symbol_id()).is_some_and(|s| list.contains(&s)))
    }

    fn forwards(&self, callee: &Expression<'_>) -> bool {
        match callee.get_inner_expression() {
            Expression::StaticMemberExpression(m) => {
                m.property.name == "ref" && self.holds(&m.object, self.objects)
            }
            e => self.holds(e, self.refs),
        }
    }
}

impl<'a> Visit<'a> for Calls<'_> {
    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        if self.forwards(&it.callee) {
            for a in &it.arguments {
                self.visit_argument(a);
            }
        } else {
            self.found = true;
        }
    }
}

pub(super) struct Collect<'s> {
    pub(super) scoping: &'s Scoping,
    pub(super) source: &'s str,
    pub(super) frames: Vec<Frame>,
    pub(super) sites: Vec<Site>,
    pub(super) count: u32,
    /// Inside a handler's value: it runs on an event, which replays.
    pub(super) handler: u32,
    /// A module-level function that JSX can name is being read: its props can be followed to the call site.
    pub(super) component: bool,
    /// Functions entered, and what the outermost one's first parameter holds: props given under a handler's name, and
    /// the objects of props (`props`, `...rest`).
    pub(super) depth: u32,
    pub(super) handlers: Vec<SymbolId>,
    pub(super) objects: Vec<SymbolId>,
    /// The component's own `ref` prop, when it's read as a name (`{ ref }`): a call to it passes the node on.
    pub(super) refs: Vec<SymbolId>,
}

impl Collect<'_> {
    pub(super) fn frame(&mut self) -> &mut Frame {
        self.frames
            .last_mut()
            .expect("`facts` visits only through `framed`")
    }

    /// Before entering a function: at the top of a component, what its parameter can be seen to hold. `scan` walks it.
    pub(super) fn props(
        &mut self,
        params: &FormalParameters<'_>,
        scan: impl FnOnce(&mut Escapes<'_>),
    ) {
        if self.depth > 0 {
            return;
        }
        self.handlers.clear();
        self.objects.clear();
        self.refs.clear();
        if !self.component {
            return;
        }
        // The first parameter alone is the props; a default, or a default on a prop, is a handler no call site wrote.
        match params
            .items
            .first()
            .filter(|p| p.initializer.is_none())
            .map(|p| &p.pattern)
        {
            Some(BindingPattern::BindingIdentifier(id)) => self.objects.push(id.symbol_id()),
            Some(BindingPattern::ObjectPattern(o)) => {
                for p in &o.properties {
                    if let (false, Some(key), BindingPattern::BindingIdentifier(id)) =
                        (p.computed, p.key.static_name(), &p.value)
                        && is_handler(&key)
                    {
                        self.handlers.push(id.symbol_id());
                        if key == "ref" {
                            self.refs.push(id.symbol_id());
                        }
                    }
                }
                if let Some(BindingPattern::BindingIdentifier(id)) =
                    o.rest.as_ref().map(|r| &r.argument)
                {
                    self.objects.push(id.symbol_id());
                }
            }
            _ => {}
        }
        let scoping = self.scoping;
        let mut e = Escapes {
            scoping,
            objects: &self.objects,
            writing: 0,
            gone: Vec::new(),
            arguments: false,
        };
        scan(&mut e);
        let (gone, arguments) = (e.gone, e.arguments);
        self.objects.retain(|s| !arguments && !gone.contains(s));
        self.handlers
            .retain(|s| !arguments && !scoping.symbol_is_mutated(*s));
        let handlers = &self.handlers;
        self.refs.retain(|s| handlers.contains(s));
    }

    /// Whether a `ref`'s value does work: see [`Calls`].
    pub(super) fn calls(&self, v: &JSXAttributeValue<'_>) -> bool {
        let mut c = Calls {
            scoping: self.scoping,
            refs: &self.refs,
            objects: &self.objects,
            found: false,
        };
        c.visit_jsx_attribute_value(v);
        c.found
    }

    pub(super) fn holds(&self, e: &Expression<'_>, list: &[SymbolId]) -> bool {
        matches!(e.get_inner_expression(), Expression::Identifier(id) if id.reference_id.get().and_then(|r| self.scoping.get_reference(r).symbol_id()).is_some_and(|s| list.contains(&s)))
    }

    /// `onClick={onClick}`, `onClick={props.onClick}`: a handler only if the caller gives one, and a caller that does
    /// has a handler at its call site, so it's that site that needs the client.
    pub(super) fn passes_on(&self, a: &JSXAttribute<'_>) -> bool {
        let Some(JSXAttributeValue::ExpressionContainer(c)) = &a.value else {
            return false;
        };
        let Some(e) = c.expression.as_expression() else {
            return false;
        };
        match e.get_inner_expression() {
            Expression::StaticMemberExpression(m) => {
                is_handler(&m.property.name) && self.holds(&m.object, &self.objects)
            }
            e => self.holds(e, &self.handlers),
        }
    }

    /// `{...rest}` of a binding's own props: what's in it was written at a call site, which is where it counts.
    pub(super) fn spreads_props(&self, e: &Expression<'_>) -> bool {
        self.holds(e, &self.objects)
    }

    pub(super) fn passes(&mut self, reason: String) {
        self.frame().passes.get_or_insert(reason);
    }

    pub(super) fn own(&mut self, reason: String) {
        self.frame().own.get_or_insert(reason);
    }

    pub(super) fn early(&mut self, reason: String) {
        self.frame().early.get_or_insert(reason);
    }

    /// An attribute on a plain element: a handler's value runs on its event.
    pub(super) fn attribute(&mut self, a: &JSXAttributeItem<'_>) {
        let on = matches!(a, JSXAttributeItem::Attribute(a) if attr_name(a) != "ref" && is_handler(&attr_name(a)));
        self.handler += u32::from(on);
        self.visit_jsx_attribute_item(a);
        self.handler -= u32::from(on);
    }

    pub(super) fn framed(&mut self, f: impl FnOnce(&mut Self)) -> Frame {
        self.frames.push(Frame::default());
        f(self);
        let frame = self
            .frames
            .pop()
            .expect("pushed above, and `f` leaves the stack as it found it");
        if let Some(up) = self.frames.last_mut() {
            up.early = up.early.take().or(frame.early.clone());
            up.passes = up.passes.take().or(frame.passes.clone());
            for g in &frame.globals {
                add(&mut up.globals, g.clone());
            }
            for c in &frame.calls {
                add(&mut up.calls, c.clone());
            }
        }
        frame
    }

    pub(super) fn global(&mut self, name: &str) {
        if self.handler == 0 {
            add(&mut self.frame().globals, name.to_string());
        }
    }

    /// `name` when `id` is bound at module level.
    pub(super) fn top(&self, id: &IdentifierReference<'_>) -> Option<String> {
        let sym = id
            .reference_id
            .get()
            .and_then(|r| self.scoping.get_reference(r).symbol_id())?;
        (self.scoping.symbol_scope_id(sym) == self.scoping.root_scope_id())
            .then(|| id.name.to_string())
    }

    pub(super) fn tag(&self, name: &JSXElementName<'_>) -> (String, Option<String>) {
        match name {
            JSXElementName::IdentifierReference(id) => (self.top(id).unwrap_or_default(), None),
            JSXElementName::MemberExpression(m) => match &m.object {
                JSXMemberExpressionObject::IdentifierReference(id) => (
                    self.top(id).unwrap_or_default(),
                    Some(m.property.name.to_string()),
                ),
                _ => (String::new(), None),
            },
            _ => (String::new(), None),
        }
    }
}
