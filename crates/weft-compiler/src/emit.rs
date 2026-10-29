//! weft's own back end (research 19), step 1: JSX → DOM code against weft's helper set.
//!
//! Input is the pre-pass's program, printed and parsed again, so every node's span indexes one text. Each
//! outermost JSX node is replaced by its lowering; expressions inside JSX are copied from that text, with their own
//! JSX lowered the same way. One lowering per construct (research 19 §3):
//!
//! | JSX                           | output                                                            |
//! |-------------------------------|-------------------------------------------------------------------|
//! | element tree                  | module-level `const _tN = _$tpl("<li>…")`, then `_tN()` and a walk |
//! | static attribute              | inlined in the template                                            |
//! | dynamic attributes of one el  | one `_$bind(() => [a, b], (v, p) => …)`                            |
//! | `onX={fn}`                    | `_$on(el, "x", fn, delegated)`                                     |
//! | `{expr}` child                | `_$child(parent, () => expr, marker?)` (`<!>` marks mixed content) |
//! | `<Comp a={x} />`              | `_$component(Comp, { get a() { return x; } })`                     |
//! | `<>…</>`                      | the child, or an array of children                                 |
//!
//! Not yet (steps 2–4): spreads on elements, namespaced attributes, SVG, SSR output, hydration, dev names.

use std::collections::BTreeSet;

use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_ast_visit::Visit;
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType, Span};

/// Bubbling events the runtime delegates to one document listener.
const DELEGATED: &[&str] = &[
    "beforeinput", "click", "contextmenu", "dblclick", "focusin", "focusout", "input", "keydown", "keyup",
    "mousedown", "mousemove", "mouseout", "mouseover", "mouseup", "pointerdown", "pointermove", "pointerout",
    "pointerover", "pointerup", "touchend", "touchmove", "touchstart",
];
/// Attributes written as DOM properties, because the attribute is only the initial value.
const PROPERTIES: &[&str] = &["value", "checked", "selected", "muted", "indeterminate", "textContent", "innerHTML"];
const VOID: &[&str] = &["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"];

#[derive(Clone, Copy)]
enum Jsx<'a> {
    El(&'a JSXElement<'a>),
    Frag(&'a JSXFragment<'a>),
}

impl Jsx<'_> {
    fn span(&self) -> Span {
        match self {
            Jsx::El(e) => e.span,
            Jsx::Frag(f) => f.span,
        }
    }
}

/// The outermost JSX nodes under a node (it doesn't descend into JSX it found).
#[derive(Default)]
struct Outermost<'a> {
    found: Vec<Jsx<'a>>,
}

impl<'a> Visit<'a> for Outermost<'a> {
    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        // SAFETY: every node lives in the arena for the whole `dom` call; the visitor only hands out shorter borrows.
        self.found.push(Jsx::El(unsafe { &*(it as *const JSXElement<'a>) }));
    }
    fn visit_jsx_fragment(&mut self, it: &JSXFragment<'a>) {
        // SAFETY: as above.
        self.found.push(Jsx::Frag(unsafe { &*(it as *const JSXFragment<'a>) }));
    }
}

pub struct Error {
    pub message: String,
    pub offset: u32,
}

/// Compile the pre-pass's printed program to DOM code importing from `module`.
pub fn dom(code: &str, filename: &str, module: &str) -> Result<String, Error> {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(filename).unwrap_or_else(|_| SourceType::tsx());
    let parsed = Parser::new(&allocator, code, source_type).parse();
    if let Some(d) = parsed.diagnostics.first() {
        return Err(Error { message: format!("weft back end: the printed pre-pass output didn't parse: {d}"), offset: 0 });
    }
    let program = parsed.program;
    let mut e = Emitter { text: code, templates: Vec::new(), helpers: BTreeSet::new(), delegated: BTreeSet::new(), uses_for: false, n: 0, error: None };
    let mut top = Outermost::default();
    top.visit_program(&program);
    let body = e.splice(Span::new(0, code.len() as u32), &top.found);
    if let Some(err) = e.error {
        return Err(err);
    }

    let mut head = String::new();
    if !e.helpers.is_empty() {
        let names: Vec<String> = e.helpers.iter().map(|h| format!("{h} as _${h}")).collect();
        head.push_str(&format!("import {{ {} }} from {:?};\n", names.join(", "), module));
    }
    if e.uses_for && !imports_binding(&program, "For") {
        head.push_str(&format!("import {{ For }} from {module:?};\n"));
    }
    // Templates go after the module's imports, so a reader meets the imports first.
    // (Imports hold no JSX, so the body's text up to their end is the printed code's.)
    let split = imports_end(&program);
    let mut out = head + &body[..split];
    if split > 0 && !out.ends_with('\n') {
        out.push('\n');
    }
    for t in &e.templates {
        out.push_str(t);
        out.push('\n');
    }
    out.push_str(body[split..].trim_start_matches('\n'));
    if !e.delegated.is_empty() {
        let names: Vec<String> = e.delegated.iter().map(|n| format!("{n:?}")).collect();
        out.push_str(&format!("\n_$delegate([{}]);\n", names.join(", ")));
    }
    Ok(out)
}

/// Byte offset just past the last top-level import (0 if none).
fn imports_end(program: &Program) -> usize {
    program.body.iter().filter_map(|s| match s {
        Statement::ImportDeclaration(i) => Some(i.span.end as usize),
        _ => None,
    }).max().unwrap_or(0)
}

fn imports_binding(program: &Program, name: &str) -> bool {
    program.body.iter().any(|s| match s {
        Statement::ImportDeclaration(i) => i.specifiers.iter().flatten().any(|sp| sp.local().name == name),
        _ => false,
    })
}

struct Emitter<'t> {
    text: &'t str,
    templates: Vec<String>,
    helpers: BTreeSet<&'static str>,
    delegated: BTreeSet<String>,
    uses_for: bool,
    n: usize,
    error: Option<Error>,
}

/// One template being built: its HTML, the node references it needs, and the operations after cloning.
struct Build {
    html: String,
    /// (path of child indices from the root, variable name)
    vars: Vec<(Vec<usize>, String)>,
    decls: Vec<String>,
    ops: Vec<String>,
}

/// A JSX child after whitespace rules: text, or a node.
enum Kid<'a> {
    Text(String),
    El(&'a JSXElement<'a>),
    Frag(&'a JSXFragment<'a>),
    Expr(&'a Expression<'a>),
}

impl<'t> Emitter<'t> {
    fn helper(&mut self, name: &'static str) -> String {
        self.helpers.insert(name);
        format!("_${name}")
    }

    fn fail(&mut self, message: impl Into<String>, at: Span) {
        if self.error.is_none() {
            self.error = Some(Error { message: message.into(), offset: at.start });
        }
    }

    fn var(&mut self) -> String {
        self.n += 1;
        format!("_e{}", self.n)
    }

    /// `span`'s text with each of `nodes` (inside it, in order) replaced by its lowering.
    fn splice(&mut self, span: Span, nodes: &[Jsx<'_>]) -> String {
        let mut out = String::new();
        let mut at = span.start as usize;
        for n in nodes {
            let s = n.span();
            out.push_str(&self.text[at..s.start as usize]);
            out.push_str(&self.lower(*n));
            at = s.end as usize;
        }
        out.push_str(&self.text[at..span.end as usize]);
        out
    }

    /// An expression's text, with any JSX inside it lowered.
    fn expr(&mut self, e: &Expression<'_>) -> String {
        let mut inner = Outermost::default();
        inner.visit_expression(e);
        self.splice(e.span(), &inner.found)
    }

    fn lower(&mut self, n: Jsx<'_>) -> String {
        match n {
            Jsx::El(el) => self.element(el),
            Jsx::Frag(f) => self.fragment(f),
        }
    }

    fn element(&mut self, el: &JSXElement<'_>) -> String {
        match component_name(&el.opening_element.name, self.text) {
            Some(name) => self.component(el, name),
            None => self.template(el),
        }
    }

    // ---- intrinsic elements: templates ---------------------------------------------------------------------

    fn template(&mut self, el: &JSXElement<'_>) -> String {
        let mut b = Build { html: String::new(), vars: vec![(vec![], self.var())], decls: Vec::new(), ops: Vec::new() };
        self.walk(el, &mut b, vec![]);
        let t = format!("_t{}", self.templates.len() + 1);
        let tpl = self.helper("tpl");
        let html = serde_json::to_string(&b.html).unwrap();
        self.templates.push(format!("const {t} = /* @__PURE__ */ {tpl}({html});"));
        let root = b.vars[0].1.clone();
        if b.decls.is_empty() && b.ops.is_empty() {
            return format!("{t}()");
        }
        let mut out = format!("(() => {{ const {root} = {t}();");
        for d in &b.decls {
            out.push(' ');
            out.push_str(d);
        }
        for o in &b.ops {
            out.push(' ');
            out.push_str(o);
        }
        out.push_str(&format!(" return {root}; }})()"));
        out
    }

    /// The variable for the node at `path`, declared through `firstChild` / `nextSibling` from the nearest known node.
    fn node(&mut self, b: &mut Build, path: &[usize]) -> String {
        if let Some((_, v)) = b.vars.iter().find(|(p, _)| p == path) {
            return v.clone();
        }
        let last = *path.last().unwrap();
        let from = if last == 0 {
            format!("{}.firstChild", self.node(b, &path[..path.len() - 1]))
        } else {
            let mut prev = path.to_vec();
            *prev.last_mut().unwrap() -= 1;
            format!("{}.nextSibling", self.node(b, &prev))
        };
        let v = self.var();
        b.decls.push(format!("const {v} = {from};"));
        b.vars.push((path.to_vec(), v.clone()));
        v
    }

    fn walk(&mut self, el: &JSXElement<'_>, b: &mut Build, path: Vec<usize>) {
        let tag = match &el.opening_element.name {
            JSXElementName::Identifier(id) => id.name.to_string(),
            other => {
                self.fail("weft back end: namespaced and member element names come in step 2", other.span());
                return;
            }
        };
        b.html.push('<');
        b.html.push_str(&tag);

        // (kind, name, expression) for the element's one binding
        let mut dynamic: Vec<(&'static str, String, String)> = Vec::new();
        for item in &el.opening_element.attributes {
            let attr = match item {
                JSXAttributeItem::Attribute(a) => a,
                JSXAttributeItem::SpreadAttribute(s) => {
                    self.fail("weft back end: `{...spread}` on an element comes in step 2 (research 19 §5)", s.span);
                    continue;
                }
            };
            let name = match &attr.name {
                JSXAttributeName::Identifier(id) => id.name.to_string(),
                JSXAttributeName::NamespacedName(ns) => {
                    self.fail("weft back end: namespaced attributes come in step 2", ns.span);
                    continue;
                }
            };
            if name == "key" {
                continue;
            }
            let name = match name.as_str() {
                "className" => "class".to_string(),
                "htmlFor" => "for".to_string(),
                _ => name,
            };
            if let Some(event) = event_name(&name) {
                let Some(expr) = attr_expression(attr) else { continue };
                let el_var = self.node(b, &path);
                let h = self.expr(expr);
                let delegated = DELEGATED.contains(&event.as_str());
                if delegated {
                    self.delegated.insert(event.clone());
                    self.helpers.insert("delegate");
                }
                let on = self.helper("on");
                b.ops.push(format!("{on}({el_var}, {event:?}, {h}, {delegated});"));
                continue;
            }
            if name == "ref" {
                let Some(expr) = attr_expression(attr) else { continue };
                let el_var = self.node(b, &path);
                let r = self.expr(expr);
                b.ops.push(format!("{{ const _r = {r}; typeof _r === \"function\" && _r({el_var}); }}"));
                continue;
            }
            match &attr.value {
                None => {
                    b.html.push(' ');
                    b.html.push_str(&name);
                }
                Some(JSXAttributeValue::StringLiteral(s)) => {
                    let raw = &self.text[s.span.start as usize + 1..s.span.end as usize - 1];
                    b.html.push_str(&format!(" {name}=\"{}\"", raw.replace('"', "&quot;")));
                }
                Some(JSXAttributeValue::ExpressionContainer(c)) => {
                    let Some(expr) = c.expression.as_expression() else { continue };
                    match static_value(expr) {
                        Some(Static::Text(t)) => b.html.push_str(&format!(" {name}=\"{}\"", escape_attr(&t))),
                        Some(Static::True) => {
                            b.html.push(' ');
                            b.html.push_str(&name);
                        }
                        Some(Static::Absent) => {}
                        None => {
                            let kind = if name == "class" {
                                "class"
                            } else if name == "style" {
                                "style"
                            } else if PROPERTIES.contains(&name.as_str()) {
                                "prop"
                            } else {
                                "attr"
                            };
                            let e = self.expr(expr);
                            dynamic.push((kind, name, e));
                        }
                    }
                }
                Some(other) => self.fail("weft back end: a JSX element as an attribute value needs `{…}`", other.span()),
            }
        }
        if !dynamic.is_empty() {
            let el_var = self.node(b, &path);
            b.ops.push(self.bind(&el_var, &dynamic));
        }
        b.html.push('>');
        if VOID.contains(&tag.as_str()) {
            return;
        }

        let kids = children(&el.children, self.text);
        let only_dynamic = match kids.as_slice() {
            [Kid::Text(_)] => false,
            [Kid::El(e)] => is_component(e, self.text),
            [_] => true,
            _ => false,
        };
        if only_dynamic {
            let parent = self.node(b, &path);
            let v = self.kid_value(&kids[0]);
            let child = self.helper("child");
            b.ops.push(format!("{child}({parent}, {v});"));
        } else {
            let mut index = 0usize;
            let mut in_text = false;
            for k in &kids {
                match k {
                    Kid::Text(t) => {
                        b.html.push_str(&escape_text(t));
                        if !in_text {
                            index += 1;
                            in_text = true;
                        }
                    }
                    Kid::El(e) if !is_component(e, self.text) => {
                        let mut p = path.clone();
                        p.push(index);
                        self.walk(e, b, p);
                        index += 1;
                        in_text = false;
                    }
                    _ => {
                        // Mixed content: a `<!>` marker holds the place; the child goes before it.
                        b.html.push_str("<!>");
                        let mut p = path.clone();
                        p.push(index);
                        let marker = self.node(b, &p);
                        let parent = self.node(b, &path);
                        let v = self.kid_value(k);
                        let child = self.helper("child");
                        b.ops.push(format!("{child}({parent}, {v}, {marker});"));
                        index += 1;
                        in_text = false;
                    }
                }
            }
        }
        b.html.push_str(&format!("</{tag}>"));
    }

    fn bind(&mut self, el: &str, dynamic: &[(&'static str, String, String)]) -> String {
        let bind = self.helper("bind");
        let apply = |s: &mut Self, kind: &str, name: &str, v: &str, p: &str| -> String {
            match kind {
                "class" => format!("{}({el}, {v}, {p})", s.helper("cls")),
                "style" => format!("{}({el}, {v}, {p})", s.helper("css")),
                "prop" => format!("({el}.{name} = {v})"),
                _ => format!("{}({el}, {name:?}, {v})", s.helper("attr")),
            }
        };
        if let [(kind, name, e)] = dynamic {
            let a = apply(self, kind, name, "v", "p");
            return format!("{bind}(() => ({e}), (v, p) => {{ v !== p && {a}; }});");
        }
        let values: Vec<&str> = dynamic.iter().map(|(_, _, e)| e.as_str()).collect();
        let mut body = String::new();
        for (i, (kind, name, _)) in dynamic.iter().enumerate() {
            let a = apply(self, kind, name, &format!("v[{i}]"), &format!("p[{i}]"));
            body.push_str(&format!(" v[{i}] !== p[{i}] && {a};"));
        }
        format!("{bind}(() => [{}], (v, p = []) => {{{body} }});", values.join(", "))
    }

    // ---- values: children, components, fragments ------------------------------------------------------------

    /// A child as a value for `_$child` or a children array: text as a string, JSX lowered, expressions deferred.
    fn kid_value(&mut self, k: &Kid<'_>) -> String {
        match k {
            Kid::Text(t) => serde_json::to_string(&decode_entities(t)).unwrap(),
            Kid::El(e) => self.element(e),
            Kid::Frag(f) => self.fragment(f),
            Kid::Expr(e) => match e.get_inner_expression() {
                Expression::JSXElement(el) => self.element(el),
                Expression::JSXFragment(f) => self.fragment(f),
                inner if static_value(inner).is_some() => self.expr(inner),
                _ => format!("() => ({})", self.expr(e)),
            },
        }
    }

    fn fragment(&mut self, f: &JSXFragment<'_>) -> String {
        let kids = children(&f.children, self.text);
        match kids.len() {
            0 => "null".into(),
            1 => self.kid_value(&kids[0]),
            _ => {
                let vs: Vec<String> = kids.iter().map(|k| self.kid_value(k)).collect();
                format!("[{}]", vs.join(", "))
            }
        }
    }

    fn component(&mut self, el: &JSXElement<'_>, name: String) -> String {
        if name == "For" {
            self.uses_for = true;
        }
        let mut sources: Vec<String> = Vec::new();
        let mut fields: Vec<String> = Vec::new();
        for item in &el.opening_element.attributes {
            match item {
                JSXAttributeItem::SpreadAttribute(s) => {
                    if !fields.is_empty() {
                        sources.push(format!("{{ {} }}", fields.join(", ")));
                        fields.clear();
                    }
                    sources.push(self.expr(&s.argument));
                }
                JSXAttributeItem::Attribute(a) => {
                    let key = match &a.name {
                        JSXAttributeName::Identifier(id) => id.name.to_string(),
                        JSXAttributeName::NamespacedName(ns) => format!("{}:{}", ns.namespace.name, ns.name.name),
                    };
                    if key == "key" {
                        continue;
                    }
                    let k = prop_key(&key);
                    let field = match &a.value {
                        None => format!("{k}: true"),
                        Some(JSXAttributeValue::StringLiteral(s)) => format!("{k}: {}", serde_json::to_string(&decode_entities(s.value.as_str())).unwrap()),
                        Some(JSXAttributeValue::ExpressionContainer(c)) => match c.expression.as_expression() {
                            None => continue,
                            Some(e) if passes_as_value(e) => format!("{k}: {}", self.expr(e)),
                            Some(e) => format!("get {k}() {{ return {}; }}", self.expr(e)),
                        },
                        Some(JSXAttributeValue::Element(e)) => format!("get {k}() {{ return {}; }}", self.element(e)),
                        Some(JSXAttributeValue::Fragment(f)) => format!("get {k}() {{ return {}; }}", self.fragment(f)),
                    };
                    fields.push(field);
                }
            }
        }
        let kids = children(&el.children, self.text);
        match kids.as_slice() {
            [] => {}
            [Kid::Text(t)] => fields.push(format!("children: {}", serde_json::to_string(&decode_entities(t)).unwrap())),
            [Kid::Expr(e)] if passes_as_value(e) => {
                let v = self.expr(e);
                fields.push(format!("children: {v}"));
            }
            [k] => {
                let v = self.kid_value(k);
                fields.push(format!("get children() {{ return {v}; }}"));
            }
            many => {
                let vs: Vec<String> = many.iter().map(|k| self.kid_value(k)).collect();
                fields.push(format!("get children() {{ return [{}]; }}", vs.join(", ")));
            }
        }
        let props = if sources.is_empty() {
            if fields.is_empty() { "{}".to_string() } else { format!("{{ {} }}", fields.join(", ")) }
        } else {
            if !fields.is_empty() {
                sources.push(format!("{{ {} }}", fields.join(", ")));
            }
            format!("{}({})", self.helper("mergeProps"), sources.join(", "))
        };
        let component = self.helper("component");
        format!("{component}({name}, {props})")
    }
}

// ---- helpers --------------------------------------------------------------------------------------------------

/// `Some(name)` for a component tag (capitalised identifier or member expression), `None` for an element.
fn component_name(name: &JSXElementName<'_>, text: &str) -> Option<String> {
    match name {
        JSXElementName::Identifier(id) => {
            let first = id.name.chars().next()?;
            (first.is_ascii_uppercase()).then(|| id.name.to_string())
        }
        JSXElementName::IdentifierReference(r) => Some(r.name.to_string()),
        JSXElementName::MemberExpression(m) => Some(text[m.span.start as usize..m.span.end as usize].to_string()),
        _ => None,
    }
}

fn is_component(el: &JSXElement<'_>, text: &str) -> bool {
    component_name(&el.opening_element.name, text).is_some()
}

/// `onClick` → `click`; `onkeydown`-style lowercase names aren't events (they're attributes).
fn event_name(name: &str) -> Option<String> {
    let rest = name.strip_prefix("on")?;
    rest.chars().next().filter(|c| c.is_ascii_uppercase())?;
    Some(rest.to_ascii_lowercase())
}

fn attr_expression<'a>(attr: &'a JSXAttribute<'a>) -> Option<&'a Expression<'a>> {
    match &attr.value {
        Some(JSXAttributeValue::ExpressionContainer(c)) => c.expression.as_expression(),
        _ => None,
    }
}

enum Static {
    Text(String),
    True,
    Absent,
}

/// Values known at compile time, inlined into the template.
fn static_value(e: &Expression<'_>) -> Option<Static> {
    match e.get_inner_expression() {
        Expression::StringLiteral(s) => Some(Static::Text(s.value.to_string())),
        Expression::NumericLiteral(n) => Some(Static::Text(n.value.to_string())),
        Expression::BooleanLiteral(b) => Some(if b.value { Static::True } else { Static::Absent }),
        Expression::NullLiteral(_) => Some(Static::Absent),
        Expression::TemplateLiteral(t) if t.expressions.is_empty() => {
            Some(Static::Text(t.quasis.first().and_then(|q| q.value.cooked.as_ref()).map(|c| c.to_string()).unwrap_or_default()))
        }
        _ => None,
    }
}

/// Props passed as plain values rather than getters: literals, names, functions and `new` (evaluated once, W016).
fn passes_as_value(e: &Expression<'_>) -> bool {
    matches!(
        e.get_inner_expression(),
        Expression::StringLiteral(_)
            | Expression::NumericLiteral(_)
            | Expression::BooleanLiteral(_)
            | Expression::NullLiteral(_)
            | Expression::Identifier(_)
            | Expression::ArrowFunctionExpression(_)
            | Expression::FunctionExpression(_)
            | Expression::NewExpression(_)
    ) || matches!(e.get_inner_expression(), Expression::TemplateLiteral(t) if t.expressions.is_empty())
}

fn prop_key(k: &str) -> String {
    let ident = k.chars().enumerate().all(|(i, c)| c == '_' || c == '$' || c.is_ascii_alphabetic() || (i > 0 && c.is_ascii_digit()));
    if ident { k.to_string() } else { format!("{k:?}") }
}

/// JSX children after JSX's whitespace rules (React's: lines trimmed, whitespace-only lines with newlines dropped).
fn children<'a>(kids: &'a oxc_allocator::Vec<'a, JSXChild<'a>>, _text: &str) -> Vec<Kid<'a>> {
    let mut out = Vec::new();
    for k in kids.iter() {
        match k {
            JSXChild::Text(t) => {
                if let Some(s) = clean_text(t.value.as_str()) {
                    out.push(Kid::Text(s));
                }
            }
            JSXChild::Element(e) => out.push(Kid::El(e)),
            JSXChild::Fragment(f) => out.push(Kid::Frag(f)),
            JSXChild::ExpressionContainer(c) => {
                if let Some(e) = c.expression.as_expression() {
                    out.push(Kid::Expr(e));
                }
            }
            JSXChild::Spread(s) => out.push(Kid::Expr(&s.expression)),
        }
    }
    out
}

fn clean_text(raw: &str) -> Option<String> {
    let lines: Vec<&str> = raw.split('\n').collect();
    let last = lines.len() - 1;
    let mut out = String::new();
    for (i, line) in lines.iter().enumerate() {
        let mut l = line.replace('\t', " ");
        if i != 0 {
            l = l.trim_start().to_string();
        }
        if i != last {
            l = l.trim_end().to_string();
        }
        if !l.is_empty() {
            if !out.is_empty() && i != 0 {
                out.push(' ');
            }
            out.push_str(&l);
        }
    }
    (!out.is_empty()).then_some(out)
}

/// JSX text is HTML-like: entities stay as written in templates (the parser decodes them) and are decoded for strings.
fn decode_entities(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        let tail = &rest[i..];
        let end = tail.find(';').filter(|&e| e <= 10);
        let decoded = end.and_then(|e| {
            let ent = &tail[1..e];
            let c = match ent {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" => Some('\''),
                "nbsp" => Some('\u{a0}'),
                _ if ent.starts_with("#x") => u32::from_str_radix(&ent[2..], 16).ok().and_then(char::from_u32),
                _ if ent.starts_with('#') => ent[1..].parse::<u32>().ok().and_then(char::from_u32),
                _ => None,
            }?;
            Some((c, e))
        });
        match decoded {
            Some((c, e)) => {
                out.push(c);
                rest = &tail[e + 1..];
            }
            None => {
                out.push('&');
                rest = &tail[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

fn escape_text(s: &str) -> String {
    s.replace('<', "&lt;")
}

fn escape_attr(s: &str) -> String {
    s.replace('&', "&amp;").replace('"', "&quot;").replace('<', "&lt;")
}
