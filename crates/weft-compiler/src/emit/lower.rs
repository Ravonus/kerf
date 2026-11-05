//! Lower emission.

use super::{
    Emitter, Error, Explained, Expression, GetSpan, JSXElement, Jsx, Outermost, Span, Visit,
    component_name, srcmap, tag_name,
};

impl Emitter<'_> {
    pub(super) fn helper(&mut self, name: &'static str) -> String {
        self.helpers.insert(name);
        format!("_${name}")
    }

    /// `ref={x}` may assign `x`: a member, or a name that isn't a const, an import, a function or a class.
    pub(super) fn assignable(&self, e: &Expression<'_>) -> bool {
        match e.get_inner_expression() {
            Expression::StaticMemberExpression(_) | Expression::ComputedMemberExpression(_) => true,
            Expression::Identifier(id) => {
                let Some(scoping) = &self.scoping else {
                    return true;
                };
                let sym = id
                    .reference_id
                    .get()
                    .and_then(|r| scoping.get_reference(r).symbol_id());
                sym.is_none_or(|s| {
                    let f = scoping.symbol_flags(s);
                    !(f.is_const_variable() || f.is_import() || f.is_function() || f.is_class())
                })
            }
            _ => false,
        }
    }

    pub(super) fn fail(&mut self, message: impl Into<String>, at: Span) {
        if self.error.is_none() {
            self.error = Some(Error {
                message: message.into(),
                offset: at.start,
            });
        }
    }

    pub(super) fn var(&mut self) -> String {
        self.n += 1;
        format!("_e{}", self.n)
    }

    /// `span`'s text with each of `nodes` (inside it, in order) replaced by its lowering.
    pub(super) fn splice(&mut self, span: Span, nodes: &[Jsx<'_>]) -> String {
        let mut out = String::new();
        let mut at = span.start as usize;
        for n in nodes {
            let s = n.span();
            out.push_str(&srcmap::copy(self.text, at, s.start as usize));
            let code = self.lower(*n);
            out.push_str(&srcmap::lowered(s.start, &code));
            at = s.end as usize;
        }
        out.push_str(&srcmap::copy(self.text, at, span.end as usize));
        out
    }

    /// An expression's text, with any JSX inside it lowered.
    pub(super) fn expr(&mut self, e: &Expression<'_>) -> String {
        let mut inner = Outermost::default();
        inner.visit_expression(e);
        self.splice(e.span(), &inner.found)
    }

    pub(super) fn lower(&mut self, n: Jsx<'_>) -> String {
        match n {
            Jsx::El(el) => self.element(el),
            Jsx::Frag(f) => self.fragment(f),
        }
    }

    pub(super) fn element(&mut self, el: &JSXElement<'_>) -> String {
        let (label, code) = if let Some(name) = component_name(&el.opening_element.name, self.text)
        {
            (format!("<{name}>"), self.component(el, &name))
        } else {
            let before = self.templates.len();
            let code = self.template(el);
            // The template it clones, then the code.
            let shown = match self.templates.get(before) {
                Some(t) if self.templates.len() > before => {
                    format!("{}\n  {code}", t.lines().last().unwrap_or(t))
                }
                _ => code.clone(),
            };
            self.explain(
                el.span,
                format!("<{}>", tag_name(&el.opening_element.name)),
                &shown,
            );
            return code;
        };
        self.explain(el.span, label, &code);
        code
    }

    pub(super) fn explain(&mut self, span: Span, node: String, code: &str) {
        if let Some(&(line, column)) = self.origin.get(&span.start) {
            self.explained.push(Explained {
                line,
                column,
                node,
                code: srcmap::strip(code),
            });
        }
    }

    /// `file:line <tag>` for dev comments and warnings, when the node came from the authored file.
    pub(super) fn place(&self, span: Span, tag: &str) -> Option<String> {
        self.origin
            .get(&span.start)
            .map(|(line, _)| format!("{}:{line} <{tag}>", self.display))
    }
}
