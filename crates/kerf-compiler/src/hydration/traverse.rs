//! Traverse for hydration.

use super::{
    ArrowFunctionExpression, Attr, CallExpression, Class, Collect, Expression, Function,
    IdentifierReference, ImportExpression, JSXAttributeItem, JSXChild, JSXElement, Kids, MOVES,
    Site, StaticMemberExpression, TSType, Visit, WINDOW, add, attr_kind, attr_name, component_tag,
    has_kids, is_handler, kids_closed, line_col, walk,
};

impl<'a> Visit<'a> for Collect<'_> {
    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        if let Some(name) = self.top(it) {
            add(&mut self.frame().uses, name);
        } else if it
            .reference_id
            .get()
            .and_then(|r| self.scoping.get_reference(r).symbol_id())
            .is_none()
            && !WINDOW.contains(&it.name.as_str())
        {
            self.global(&it.name);
        }
    }

    fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
        if matches!(it.object.get_inner_expression(), Expression::Identifier(id) if WINDOW.contains(&id.name.as_str()))
        {
            self.global(&it.property.name);
        }
        walk::walk_static_member_expression(self, it);
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        if self.handler == 0 {
            match it.callee.get_inner_expression() {
                Expression::Identifier(id) => {
                    if let Some(name) = self.top(id) {
                        add(&mut self.frame().calls, name);
                    }
                }
                Expression::StaticMemberExpression(m) => {
                    if MOVES.contains(&m.property.name.as_str()) {
                        self.global(&format!(".{}", m.property.name));
                    }
                    if let Expression::Identifier(id) = m.object.get_inner_expression()
                        && let Some(name) = self.top(id)
                    {
                        add(&mut self.frame().calls, name);
                    }
                }
                _ => {}
            }
        }
        walk::walk_call_expression(self, it);
    }

    /// What it brings isn't among the files this reads, so it could hold anything.
    fn visit_import_expression(&mut self, it: &ImportExpression<'a>) {
        if self.handler == 0 {
            let line = line_col(self.source, it.span.start).0;
            self.own(format!("`import()` outside a handler (line {line})"));
        }
        walk::walk_import_expression(self, it);
    }

    fn visit_ts_type(&mut self, _: &TSType<'a>) {}

    fn visit_function(&mut self, it: &Function<'a>, flags: oxc_syntax::scope::ScopeFlags) {
        self.props(&it.params, |e| walk::walk_function(e, it, flags));
        self.depth += 1;
        walk::walk_function(self, it, flags);
        self.depth -= 1;
    }

    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        self.props(&it.params, |e| walk::walk_arrow_function_expression(e, it));
        self.depth += 1;
        walk::walk_arrow_function_expression(self, it);
        self.depth -= 1;
    }

    fn visit_class(&mut self, it: &Class<'a>) {
        self.depth += 1;
        walk::walk_class(self, it);
        self.depth -= 1;
    }

    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        if !component_tag(&it.opening_element.name) {
            self.intrinsic(it);
            return;
        }
        self.component(it);
    }
}

impl Collect<'_> {
    fn intrinsic(&mut self, it: &JSXElement<'_>) {
        let open = &it.opening_element;
        for a in &open.attributes {
            let a = match a {
                JSXAttributeItem::Attribute(a) => a,
                JSXAttributeItem::SpreadAttribute(s) => {
                    let why = format!(
                        "a spread on an element (line {})",
                        line_col(self.source, s.span.start).0
                    );
                    if self.spreads_props(&s.argument) {
                        self.passes(why);
                    } else {
                        self.own(why);
                    }
                    continue;
                }
            };
            let name = attr_name(a);
            let line = line_col(self.source, a.span.start).0;
            if is_handler(&name) {
                let why = format!("`{name}` on an element (line {line})");
                if self.passes_on(a) {
                    self.passes(why);
                } else {
                    self.own(why);
                }
            }
            if name.eq_ignore_ascii_case("autofocus") {
                self.early(format!("`autofocus` (line {line})"));
            }
            if name == "ref" && a.value.as_ref().is_some_and(|v| self.calls(v)) {
                self.early(format!("a `ref` callback that does work (line {line})"));
            }
        }
        for a in &open.attributes {
            self.attribute(a);
        }
        for k in &it.children {
            self.visit_jsx_child(k);
        }
    }

    fn component(&mut self, it: &JSXElement<'_>) {
        let open = &it.opening_element;
        let index = self.count;
        self.count += 1;
        let (tag, member) = self.tag(&open.name);
        let (attrs, handler) = self.component_attributes(it, &tag, member.as_deref());
        let first = self.sites.len();
        let scoping = self.scoping;
        let f = self.framed(|c| {
            for k in &it.children {
                c.visit_jsx_child(k);
            }
        });
        let function_child = it.children.iter().any(|k| {
            matches!(k, JSXChild::ExpressionContainer(c) if c.expression.as_expression().is_some_and(|e| matches!(e.get_inner_expression(), Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_))))
        });
        let kids = Kids {
            present: has_kids(it),
            closed: kids_closed(scoping, it),
            own: f
                .own
                .or(function_child.then(|| "a function child".to_string())),
            uses: f.uses,
            sites: self.sites[first..].iter().map(|s| s.index).collect(),
        };
        let line = line_col(self.source, it.span.start).0;
        // Before its children's, so the list reads in source order.
        self.sites.insert(
            first,
            Site {
                index,
                line,
                tag,
                member,
                handler,
                attrs,
                kids,
            },
        );
    }

    fn component_attributes(
        &mut self,
        it: &JSXElement<'_>,
        tag: &str,
        member: Option<&str>,
    ) -> (Vec<Attr>, bool) {
        let open = &it.opening_element;
        let (mut attrs, mut handler) = (Vec::new(), false);
        for item in &open.attributes {
            match item {
                JSXAttributeItem::SpreadAttribute(s) => {
                    if self.spreads_props(&s.argument) {
                        self.passes(format!(
                            "a spread on <{}> (line {})",
                            member.unwrap_or(tag),
                            line_col(self.source, s.span.start).0
                        ));
                    } else {
                        handler = true;
                    }
                    let f = self.framed(|c| c.visit_expression(&s.argument));
                    attrs.push(Attr {
                        name: "...".into(),
                        kind: "spread".into(),
                        uses: f.uses,
                        own: f.own,
                        early: None,
                    });
                }
                JSXAttributeItem::Attribute(a) => {
                    let name = attr_name(a);
                    if name == "key" {
                        continue;
                    }
                    handler |= is_handler(&name);
                    let kind = attr_kind(self.scoping, a).to_string();
                    let early = (name == "ref" && a.value.as_ref().is_some_and(|v| self.calls(v)))
                        .then(|| {
                            let line = line_col(self.source, a.span.start).0;
                            format!("a `ref` callback that does work (line {line})")
                        });
                    if let Some(why) = &early {
                        self.early(why.clone());
                    }
                    let f = self.framed(|c| {
                        let on = name != "ref" && is_handler(&name);
                        c.handler += u32::from(on);
                        if let Some(v) = &a.value {
                            c.visit_jsx_attribute_value(v);
                        }
                        c.handler -= u32::from(on);
                    });
                    attrs.push(Attr {
                        name,
                        kind,
                        uses: f.uses,
                        own: f.own,
                        early,
                    });
                }
            }
        }
        (attrs, handler)
    }
}
