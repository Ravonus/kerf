//! weft's own back end (research 19), steps 1–2: JSX → DOM code against weft's helper set.
//!
//! Input is the pre-pass's program, printed and parsed again, so every node's span indexes one text. Each
//! outermost JSX node is replaced by its lowering; expressions inside JSX are copied from that text, with their own
//! JSX lowered the same way. One lowering per construct (research 19 §3):
//!
//! | JSX                           | output                                                              |
//! |-------------------------------|---------------------------------------------------------------------|
//! | element tree                  | module-level `const _tN = _$tpl("<li>…")`, then `_tN()` and a walk   |
//! | static attribute              | inlined in the template                                              |
//! | dynamic attributes of one el  | one `_$bind(() => [a, b], (v, p) => …)` (`<select>`: after children) |
//! | `onX={fn}`                    | `_$on(el, "x", fn, delegated)`                                       |
//! | `ref={el}` / `ref={fn}`       | assigns the variable / calls the function                            |
//! | `{...rest}` on an element     | `_$spread(el, () => ({ a: x, ...rest }))`; no JSX children: a `_$mergeProps` object whose `children` is a hole |
//! | `{expr}` child                | `_$child(parent, () => expr, marker?)` (`<!>` marks mixed content)   |
//! | `{c ? <A/> : <B/>}`, `&&`     | a `_$child` whose condition is read through `_$memo`                 |
//! | `<Comp a={x} />`              | `_$component(Comp, { get a() { return x; } })`                       |
//! | `<g.icon />` in a row         | `_$component(g().icon, {})`: the pre-pass's `_$tag={g().icon}` (`TAG`) replaces the tag |
//! | `<>…</>`                      | the child, or an array of children                                   |
//! | SVG root outside `<svg>`      | `_$tpl(html, true)`                                                  |
//!
//! Lists arrive from the pre-pass as `<For each by>{x => …}</For>` and lower as a component.
//! Not yet (steps 3–4): SSR output, hydration by path key, dev names, source maps.

use std::collections::{BTreeSet, HashMap};

use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_ast_visit::{Visit, walk};
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType, Span};

use crate::hydration::{ISLAND, marked};
use crate::{react, srcmap};

/// Bubbling events the runtime delegates to one document listener.
const DELEGATED: &[&str] = &[
    "beforeinput", "click", "contextmenu", "dblclick", "focusin", "focusout", "input", "keydown", "keyup",
    "mousedown", "mousemove", "mouseout", "mouseover", "mouseup", "pointerdown", "pointermove", "pointerout",
    "pointerover", "pointerup", "touchend", "touchmove", "touchstart",
];
/// Attributes written as DOM properties, because the attribute is only the initial value.
const PROPERTIES: &[&str] = &["value", "checked", "selected", "muted", "indeterminate", "textContent", "innerHTML", "defaultValue", "defaultChecked"];
/// SVG elements that need an <svg> around them to parse as SVG (`a`, `script`, `style` and `title` are left out:
/// HTML has them too).
const SVG: &[&str] = &[
    "animate", "animateMotion", "animateTransform", "circle", "clipPath", "defs", "desc", "ellipse", "feBlend",
    "feColorMatrix", "feComposite", "feFlood", "feGaussianBlur", "feMerge", "feMergeNode", "feOffset", "filter",
    "foreignObject", "g", "image", "line", "linearGradient", "marker", "mask", "metadata", "path", "pattern",
    "polygon", "polyline", "radialGradient", "rect", "stop", "switch", "symbol", "text", "textPath", "tspan", "use",
    "view",
];
/// The attribute the pre-pass adds to a component tag it can't rewrite in place: its value is the live read of the tag.
pub const TAG: &str = "_$tag";
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

/// Every JSX element and fragment, in source order (pre-order). The pre-pass's program and its printed copy list
/// the same nodes in the same order, which is how a lowered node finds its line in the authored file.
#[derive(Default)]
pub struct JsxOrder {
    pub spans: Vec<Span>,
}

impl<'a> Visit<'a> for JsxOrder {
    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        self.spans.push(it.span);
        walk::walk_jsx_element(self, it);
    }
    fn visit_jsx_fragment(&mut self, it: &JSXFragment<'a>) {
        self.spans.push(it.span);
        walk::walk_jsx_fragment(self, it);
    }
}

pub struct EmitOptions<'a> {
    pub filename: &'a str,
    /// The file as dev comments and `weft explain` name it (relative to the working directory).
    pub display: &'a str,
    pub module: &'a str,
    pub ssr: bool,
    pub hydratable: bool,
    /// Dev output: a `// file:line <tag>` comment per template, and the location passed to `tpl` for warnings.
    pub dev: bool,
    /// Each JSX node's (line, column) in the authored file, in `JsxOrder` (`None`: made by the pre-pass).
    pub origins: Vec<Option<(u32, u32)>>,
    /// Write a source map to the authored file through codegen's map of the printed program (`srcmap::points`).
    pub map: Option<(&'a srcmap::Points, &'a str)>,
}

/// What one JSX node became (`weft explain file:line`).
#[derive(Debug, serde::Serialize)]
pub struct Explained {
    pub line: u32,
    pub column: u32,
    /// `<li>`, `<ProductRow>`, `<>`
    pub node: String,
    pub code: String,
}

pub struct Emitted {
    pub code: String,
    /// The source map (JSON), when `EmitOptions::map` is set.
    pub map: Option<String>,
    pub explain: Vec<Explained>,
}

/// Compile the pre-pass's printed program to DOM code (or server code, `ssr`) importing from `module`.
pub fn emit(code: &str, o: EmitOptions) -> Result<Emitted, Error> {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(o.filename).unwrap_or_else(|_| SourceType::tsx());
    let parsed = Parser::new(&allocator, code, source_type).parse();
    if let Some(d) = parsed.diagnostics.first() {
        return Err(Error { message: format!("weft back end: the printed pre-pass output didn't parse: {d}"), offset: 0 });
    }
    let program = parsed.program;
    // Resolves `ref={x}`: a `let` is assigned the element, a const or an import is called with it.
    let scoping = code.contains("ref").then(|| oxc_semantic::SemanticBuilder::new().build(&program).semantic.into_scoping());
    let module = o.module;
    let mut order = JsxOrder::default();
    order.visit_program(&program);
    // Fewer origins than nodes: shape variants, appended after the authored code, have no line. Any other difference
    // and the mapping can't be trusted: no lines rather than wrong ones.
    let origin = if order.spans.len() >= o.origins.len() {
        order.spans.iter().zip(&o.origins).filter_map(|(s, l)| l.map(|l| (s.start, l))).collect()
    } else {
        HashMap::new()
    };
    let mut e = Emitter {
        text: code, templates: Vec::new(), helpers: BTreeSet::new(), delegated: BTreeSet::new(), uses_for: false, n: 0, error: None,
        ssr: o.ssr, hydratable: o.hydratable && !o.ssr, dev: o.dev, display: o.display.to_string(), origin, explained: Vec::new(), keys: Vec::new(),
        scoping,
    };
    let mut top = Outermost::default();
    top.visit_program(&program);
    // Imports hold no JSX: they're copied as they are, and the templates go after them.
    let split = imports_end(&program);
    let imports = srcmap::copy(code, 0, split);
    let body = e.splice(Span::new(split as u32, code.len() as u32), &top.found);
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
    let mut out = head + &imports;
    if split > 0 && !code[..split].ends_with('\n') {
        out.push('\n');
    }
    for t in &e.templates {
        out.push_str(t);
        out.push('\n');
    }
    out.push_str(&trim_marked_newlines(&body));
    if !e.delegated.is_empty() {
        let names: Vec<String> = e.delegated.iter().map(|n| format!("{n:?}")).collect();
        out.push_str(&format!("\n_$delegate([{}]);\n", names.join(", ")));
    }
    e.explained.sort_by_key(|x| (x.line, x.column));
    let (out, map) = srcmap::decode(&out, o.map.map(|(points, source)| srcmap::Mapping { points, file: o.filename, source }));
    Ok(Emitted { code: out, map, explain: e.explained })
}

/// `body` without its leading newlines (they follow the imports), keeping its first marker in place.
fn trim_marked_newlines(body: &str) -> String {
    let marker_end = if body.starts_with('\u{E000}') { body.find('\u{E003}').map_or(0, |i| i + '\u{E003}'.len_utf8()) } else { 0 };
    let (marker, rest) = body.split_at(marker_end);
    let trimmed = rest.trim_start_matches('\n');
    if marker.is_empty() || trimmed.len() == rest.len() {
        return format!("{marker}{trimmed}");
    }
    // The copy now starts later in the printed text: renumber its marker.
    let at: usize = marker.trim_matches(|c| c == '\u{E000}' || c == '\u{E003}').parse().unwrap_or(0);
    format!("\u{E000}{}\u{E003}{trimmed}", at + rest.len() - trimmed.len())
}

/// Byte offset just past the module's leading imports (0 if none). An import after other code stays where it is in
/// the body (imports are hoisted anyway), so JSX before it is still lowered.
fn imports_end(program: &Program) -> usize {
    program.body.iter().map_while(|s| match s {
        Statement::ImportDeclaration(i) => Some(i.span.end as usize),
        _ => None,
    }).last().unwrap_or(0)
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
    /// Server output (`ssr`, `key`, `hole`, `attr`) instead of DOM code.
    ssr: bool,
    /// DOM output that can hydrate: hole scopes and `first`/`next` walks.
    hydratable: bool,
    dev: bool,
    display: String,
    /// Printed span start → (line, column) in the authored file.
    origin: HashMap<u32, (u32, u32)>,
    explained: Vec<Explained>,
    /// The keys of the keyed lists being emitted (`row().id` for `by={(row) => row.id}`), innermost last. A row's
    /// key can't change while the row lives, so a hole or attribute that is exactly its key is written once.
    keys: Vec<String>,
    scoping: Option<oxc_semantic::Scoping>,
}

/// One template being built: its HTML, the node references it needs, and the operations after cloning.
struct Build {
    html: String,
    /// The server output: static HTML and code, in document order.
    ssr: Vec<Piece>,
    /// Holes so far (each takes the next slot).
    slots: usize,
    /// (path of child indices from the root, variable name)
    vars: Vec<(Vec<usize>, String)>,
    decls: Vec<String>,
    ops: Vec<String>,
}

enum Piece {
    Static(String),
    Code(String),
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

    /// `ref={x}` may assign `x`: a member, or a name that isn't a const, an import, a function or a class.
    fn assignable(&self, e: &Expression<'_>) -> bool {
        match e.get_inner_expression() {
            Expression::StaticMemberExpression(_) | Expression::ComputedMemberExpression(_) => true,
            Expression::Identifier(id) => {
                let Some(scoping) = &self.scoping else { return true };
                let sym = id.reference_id.get().and_then(|r| scoping.get_reference(r).symbol_id());
                sym.is_none_or(|s| {
                    let f = scoping.symbol_flags(s);
                    !(f.is_const_variable() || f.is_import() || f.is_function() || f.is_class())
                })
            }
            _ => false,
        }
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
            out.push_str(&srcmap::copy(self.text, at, s.start as usize));
            let code = self.lower(*n);
            out.push_str(&srcmap::lowered(s.start, &code));
            at = s.end as usize;
        }
        out.push_str(&srcmap::copy(self.text, at, span.end as usize));
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
        let (label, code) = match component_name(&el.opening_element.name, self.text) {
            Some(name) => (format!("<{name}>"), self.component(el, name)),
            None => {
                let before = self.templates.len();
                let code = self.template(el);
                // The template it clones, then the code.
                let shown = match self.templates.get(before) {
                    Some(t) if self.templates.len() > before => format!("{}\n  {code}", t.lines().last().unwrap_or(t)),
                    _ => code.clone(),
                };
                self.explain(el.span, format!("<{}>", tag_name(&el.opening_element.name)), &shown);
                return code;
            }
        };
        self.explain(el.span, label, &code);
        code
    }

    fn explain(&mut self, span: Span, node: String, code: &str) {
        if let Some(&(line, column)) = self.origin.get(&span.start) {
            self.explained.push(Explained { line, column, node, code: srcmap::strip(code) });
        }
    }

    /// `file:line <tag>` for dev comments and warnings, when the node came from the authored file.
    fn place(&self, span: Span, tag: &str) -> Option<String> {
        self.origin.get(&span.start).map(|(line, _)| format!("{}:{line} <{tag}>", self.display))
    }

    // ---- intrinsic elements: templates ---------------------------------------------------------------------

    fn template(&mut self, el: &JSXElement<'_>) -> String {
        let mut b = Build { html: String::new(), ssr: Vec::new(), vars: vec![(vec![], self.var())], decls: Vec::new(), ops: Vec::new(), slots: 0 };
        self.walk(el, &mut b, vec![]);
        if self.ssr {
            // `ssr(_k => "<li" + key(_k) + … )`: static parts and holes, in document order.
            let mut parts: Vec<String> = Vec::new();
            for p in &b.ssr {
                parts.push(match p {
                    Piece::Static(s) => serde_json::to_string(s).unwrap(),
                    Piece::Code(c) => c.clone(),
                });
            }
            let ssr = self.helper("ssr");
            let note = match self.place(el.span, &tag_name(&el.opening_element.name)) {
                Some(p) if self.dev => format!("/* {p} */ "),
                _ => String::new(),
            };
            return format!("{note}{ssr}((_k) => {})", parts.join(" + "));
        }
        let t = format!("_t{}", self.templates.len() + 1);
        // Hydratable output claims the server's elements (`htpl`, weft/dom's claim.ts); client-only output doesn't ship that.
        let tpl = self.helper(if self.hydratable { "htpl" } else { "tpl" });
        let html = serde_json::to_string(&b.html).unwrap();
        // An SVG element outside an <svg> (a component returning <path/>) is parsed inside one, then lifted out.
        let svg = matches!(&el.opening_element.name, JSXElementName::Identifier(id) if SVG.contains(&id.name.as_str()));
        let place = if self.dev { self.place(el.span, &tag_name(&el.opening_element.name)) } else { None };
        // Dev: `// App.tsx:12 <li>` above the template; hydratable output also passes it to `htpl` for its warnings.
        let args = match (place.as_ref().filter(|_| self.hydratable), svg) {
            (Some(p), _) => format!(", {}, {p:?}", if svg { "true" } else { "false" }),
            (None, true) => ", true".into(),
            (None, false) => String::new(),
        };
        let note = place.map(|p| format!("// {p}\n")).unwrap_or_default();
        self.templates.push(format!("{note}const {t} = /* @__PURE__ */ {tpl}({html}{args});"));
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

    /// HTML both the template and the server output contain.
    fn put(b: &mut Build, s: &str) {
        b.html.push_str(s);
        match b.ssr.last_mut() {
            Some(Piece::Static(t)) => t.push_str(s),
            _ => b.ssr.push(Piece::Static(s.to_string())),
        }
    }

    /// Server-only output: static (`Piece::Static`) or code.
    fn server(b: &mut Build, p: Piece) {
        match (b.ssr.last_mut(), p) {
            (Some(Piece::Static(t)), Piece::Static(s)) => t.push_str(&s),
            (_, p) => b.ssr.push(p),
        }
    }

    /// The variable for the node at `path`. It's reached from the nearest earlier sibling that has one (or its
    /// parent's first child) by sibling steps; only nodes something uses get a variable. Hydratable output steps
    /// with `first`/`next`, which pass over the server's hole ranges.
    fn node(&mut self, b: &mut Build, path: &[usize]) -> String {
        if let Some((_, v)) = b.vars.iter().find(|(p, _)| p == path) {
            return v.clone();
        }
        let (parent, last) = (&path[..path.len() - 1], *path.last().unwrap());
        let sibling = b.vars.iter().filter(|(p, _)| p.len() == path.len() && &p[..p.len() - 1] == parent && p[p.len() - 1] < last).max_by_key(|(p, _)| p[p.len() - 1]).map(|(p, v)| (p[p.len() - 1], v.clone()));
        let (mut from, steps) = match sibling {
            Some((at, v)) => (v, last - at),
            None => {
                let p = self.node(b, parent);
                (if self.hydratable { format!("{}({p})", self.helper("first")) } else { format!("{p}.firstChild") }, last)
            }
        };
        for _ in 0..steps {
            from = if self.hydratable { format!("{}({from})", self.helper("next")) } else { format!("{from}.nextSibling") };
        }
        let v = self.var();
        b.decls.push(format!("const {v} = {from};"));
        b.vars.push((path.to_vec(), v.clone()));
        v
    }

    fn walk(&mut self, el: &JSXElement<'_>, b: &mut Build, path: Vec<usize>) {
        let tag = match &el.opening_element.name {
            JSXElementName::Identifier(id) => id.name.to_string(),
            JSXElementName::NamespacedName(n) => format!("{}:{}", n.namespace.name, n.name.name),
            other => {
                self.fail("weft back end: this element name isn't supported", other.span());
                return;
            }
        };
        Self::put(b, &format!("<{tag}"));
        if path.is_empty() && self.ssr {
            let key = self.helper("key");
            Self::server(b, Piece::Code(format!("{key}(_k)")));
        }
        let has_kids = !children(&el.children, self.text).is_empty();

        // `<div {...rest} a={x}>`: every attribute goes through one `spread` (later wins, as for components), which
        // reads them all as one plain object, `{ a: x, ...rest }`. JSX children stay in the template. Without them,
        // the merged props' `children` is the element's one hole, so the server renders it and hydration adopts it
        // like any other.
        if el.opening_element.attributes.iter().any(|a| matches!(a, JSXAttributeItem::SpreadAttribute(_))) {
            let void = VOID.contains(&tag.as_str());
            if !self.ssr
                && (has_kids || void)
                && let Some(object) = self.spread_object(&el.opening_element.attributes)
            {
                let el_var = self.node(b, &path);
                let spread = self.helper("spread");
                b.ops.push(format!("{spread}({el_var}, () => ({object}));"));
                Self::put(b, ">");
                if !void {
                    self.kids(el, b, &path);
                    Self::put(b, &format!("</{tag}>"));
                }
                return;
            }
            let props = self.props(&el.opening_element.attributes, Vec::new(), true);
            let spread = self.helper("spread");
            if self.ssr {
                Self::server(b, Piece::Code(format!("{spread}({props})")));
            } else {
                let el_var = self.node(b, &path);
                self.n += 1;
                let p = format!("_p{}", self.n);
                b.ops.push(format!("const {p} = {props}; {spread}({el_var}, () => ({{ ...{p} }}));"));
                if !has_kids && !void {
                    Self::put(b, ">");
                    // Hydrating, content the props wrote stays: the server rendered it into this hole.
                    let kids = if self.hydratable { format!("{}({p}, {el_var})", self.helper("kids")) } else { format!("{p}.children") };
                    self.hole_code(b, &path, format!("() => {kids}"), false, None);
                    Self::put(b, &format!("</{tag}>"));
                    return;
                }
            }
            Self::put(b, ">");
            if void {
                return;
            }
            if has_kids {
                self.kids(el, b, &path);
            } else {
                // The server reads the merged props again; a merged object reads its sources on every access anyway.
                let inner = self.helper("inner");
                self.hole_code(b, &path, format!("() => {inner}({props}, {tag:?})"), false, None);
            }
            Self::put(b, &format!("</{tag}>"));
            return;
        }

        // (kind, name, expression) for the element's one binding
        let mut dynamic: Vec<(&'static str, String, String)> = Vec::new();
        // Server: what `textContent` or `innerHTML` puts inside the element.
        let mut content: Option<String> = None;
        for item in &el.opening_element.attributes {
            let JSXAttributeItem::Attribute(attr) = item else { continue };
            let name = match &attr.name {
                JSXAttributeName::Identifier(id) => id.name.to_string(),
                // `xlink:href`, `xml:lang`: written with their namespace (`attr` looks the prefix up).
                JSXAttributeName::NamespacedName(ns) => format!("{}:{}", ns.namespace.name, ns.name.name),
            };
            if name == "key" {
                continue;
            }
            let raw = name == "dangerouslySetInnerHTML";
            let name = if raw { "innerHTML".to_string() } else { react::attribute(&name) };
            if let Some((event, capture)) = react::event(&name) {
                let Some(expr) = attr_expression(attr) else { continue };
                if self.ssr {
                    continue;
                }
                let el_var = self.node(b, &path);
                let h = self.expr(expr);
                if capture {
                    b.ops.push(format!("{el_var}.addEventListener({event:?}, {h}, true);"));
                    continue;
                }
                if event == "change" {
                    let change = self.helper("change");
                    b.ops.push(format!("{change}({el_var}, {h});"));
                    continue;
                }
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
                // `ref={fn}` or `ref={[a, b]}` calls them with the element; `ref={el}` on a variable assigns it.
                let Some(expr) = attr_expression(attr) else { continue };
                if self.ssr {
                    continue;
                }
                let el_var = self.node(b, &path);
                let r = self.expr(expr);
                let call = self.helper("ref");
                b.ops.push(if self.assignable(expr) {
                    format!("{{ const _r = {r}; typeof _r === \"function\" || Array.isArray(_r) ? {call}(() => _r, {el_var}) : ({r} = {el_var}); }}")
                } else {
                    format!("{call}(() => {r}, {el_var});")
                });
                continue;
            }
            // React focuses on mount; the attribute alone only works during page load.
            if name == "autofocus" && !self.ssr {
                let v = attr_expression(attr).map_or("true".to_string(), |e| self.expr(e));
                let el_var = self.node(b, &path);
                let focus = self.helper("focus");
                b.ops.push(format!("{focus}({el_var}, {v});"));
            }
            // A <textarea> or <select> has no value attribute: the value is its content or its selected option.
            if (tag == "textarea" || tag == "select") && (name == "value" || name == "defaultValue") {
                let v = match &attr.value {
                    Some(JSXAttributeValue::StringLiteral(s)) => serde_json::to_string(&decode_entities(s.value.as_str())).unwrap(),
                    Some(JSXAttributeValue::ExpressionContainer(c)) => match c.expression.as_expression() {
                        Some(e) => self.expr(e),
                        None => continue,
                    },
                    _ => continue,
                };
                if !self.ssr {
                    dynamic.push(("prop", if tag == "select" { "value".to_string() } else { name }, v));
                } else if tag == "select" {
                    let select = self.helper("select");
                    Self::server(b, Piece::Code(format!("{select}({v})")));
                } else {
                    content = Some(format!("{}(String(({v}) ?? \"\"))", self.helper("escape")));
                }
                continue;
            }
            // In HTML the attribute is the default: `.value` and `.checked` start from it.
            let html = match name.as_str() {
                "defaultValue" => "value",
                "defaultChecked" => "checked",
                other => other,
            }
            .to_string();
            match &attr.value {
                None if react::takes_words(&name) => Self::put(b, &format!(" {html}=\"true\"")),
                None => Self::put(b, &format!(" {html}")),
                Some(JSXAttributeValue::StringLiteral(s)) => {
                    let text = &self.text[s.span.start as usize + 1..s.span.end as usize - 1];
                    Self::put(b, &format!(" {html}=\"{}\"", text.replace('"', "&quot;")));
                }
                Some(JSXAttributeValue::ExpressionContainer(c)) => {
                    let Some(expr) = c.expression.as_expression() else { continue };
                    // Some states are the words `true`/`false` (`aria-pressed={false}` is not a missing attribute).
                    let known = match expr.get_inner_expression() {
                        Expression::BooleanLiteral(v) if react::takes_words(&name) => Some(Static::Text(v.value.to_string())),
                        _ => static_value(expr),
                    };
                    match known {
                        Some(Static::Text(t)) => Self::put(b, &format!(" {html}=\"{}\"", escape_attr(&t))),
                        Some(Static::True) => Self::put(b, &format!(" {html}")),
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
                            let e = if raw { format!("({e})?.__html ?? \"\"") } else { e };
                            if (name == "textContent" || name == "innerHTML") && has_kids {
                                self.fail(format!("weft back end: an element with `{name}` can't also have children (it replaces them)"), attr.span);
                                continue;
                            }
                            if self.ssr {
                                // Content properties aren't attributes: the server writes them as the content.
                                if name == "textContent" {
                                    content = Some(format!("{}(String(({e}) ?? \"\"))", self.helper("escape")));
                                } else if name == "innerHTML" {
                                    content = Some(format!("String(({e}) ?? \"\")"));
                                } else {
                                    let call = if tag == "select" && name == "value" {
                                        format!("{}({e})", self.helper("select"))
                                    } else {
                                        format!("{}({html:?}, {e})", self.helper("attr"))
                                    };
                                    Self::server(b, Piece::Code(call));
                                }
                            } else if !self.hydratable && self.is_key(&e) {
                                // Hydrating, the server wrote it and a write would be a mutation: bind skips it.
                                let el_var = self.node(b, &path);
                                let w = self.write(&el_var, kind, &name, &e, "undefined");
                                b.ops.push(format!("{w};"));
                            } else {
                                dynamic.push((kind, name, e));
                            }
                        }
                    }
                }
                Some(other) => self.fail("weft back end: a JSX element as an attribute value needs `{…}`", other.span()),
            }
        }
        // A <select>'s value is set after its children, so the matching <option> exists by then.
        let late = tag == "select" && !dynamic.is_empty();
        if !dynamic.is_empty() && !late {
            let el_var = self.node(b, &path);
            b.ops.push(self.bind(&el_var, &dynamic));
        }
        Self::put(b, ">");
        if VOID.contains(&tag.as_str()) {
            return;
        }
        if let Some(c) = content {
            Self::server(b, Piece::Code(c));
        }
        self.kids(el, b, &path);
        if late {
            let el_var = self.node(b, &path);
            b.ops.push(self.bind(&el_var, &dynamic));
        }
        Self::put(b, &format!("</{tag}>"));
    }

    /// An element's children: static ones into the template, holes as `child` calls (server: `hole`). Each hole
    /// takes the template's next slot, the same on both sides.
    fn kids(&mut self, el: &JSXElement<'_>, b: &mut Build, path: &[usize]) {
        let path = path.to_vec();
        let kids = children(&el.children, self.text);
        let only_dynamic = match kids.as_slice() {
            [Kid::Text(_)] => false,
            [Kid::El(e)] => is_component(e, self.text),
            [_] => true,
            _ => false,
        };
        if only_dynamic {
            self.hole(b, &path, &kids[0], None);
            return;
        }
        let mut index = 0usize;
        let mut in_text = false;
        for k in &kids {
            match k {
                Kid::Text(t) => {
                    Self::put(b, &escape_text(t));
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
                    // Mixed content: the template's `<!>` holds the place (the child goes before it); the server
                    // marks the hole's range with `<!--[-->` … `<!--]-->`.
                    b.html.push_str("<!>");
                    let mut p = path.clone();
                    p.push(index);
                    self.hole(b, &path, k, Some(p));
                    index += 1;
                    in_text = false;
                }
            }
        }
    }

    /// One child hole: the next slot of the template, its value, and (mixed content) the marker at `marker`.
    fn hole(&mut self, b: &mut Build, parent: &[usize], k: &Kid<'_>, marker: Option<Vec<usize>>) {
        let (v, once) = self.hole_value(k);
        self.hole_code(b, parent, v, once, marker);
    }

    /// A hole whose value is the code `v` (`once`: static structure, built once).
    fn hole_code(&mut self, b: &mut Build, parent: &[usize], v: String, once: bool, marker: Option<Vec<usize>>) {
        let slot = b.slots;
        b.slots += 1;
        if self.ssr {
            // Mixed content needs a range, except static structure that turns out to be one element (`2`): the server
            // knows, and the client's walk and `hchild` read the element as the hole. `hole` writes the markers.
            let hole = self.helper("hole");
            let mixed = match (marker.is_some(), once) {
                (false, _) => "",
                (true, true) => ", 2",
                (true, false) => ", 1",
            };
            Self::server(b, Piece::Code(format!("{hole}(_k, {slot}, {v}{mixed})")));
            return;
        }
        let marker = marker.map(|p| self.node(b, &p));
        let parent = self.node(b, parent);
        let child = self.helper(if self.hydratable { "hchild" } else { "child" });
        let mut args = vec![parent, v];
        if self.hydratable {
            // The hole's scope is named by its template's key (`root.$k`) and its slot.
            args.push(marker.unwrap_or_else(|| "null".into()));
            args.push(b.vars[0].1.clone());
            args.push(slot.to_string());
            if once {
                args.push("1".into());
            }
        } else if let Some(m) = marker {
            args.push(m);
        }
        b.ops.push(format!("{child}({});", args.join(", ")));
    }

    /// A hole's value, and whether it's static structure built once (`once`). Where keys matter (hydratable and
    /// server output) structure is deferred, `() => …`, so it's built inside the hole's scope.
    fn hole_value(&mut self, k: &Kid<'_>) -> (String, bool) {
        let v = self.kid_value(k);
        let structure = match k {
            Kid::El(_) | Kid::Frag(_) => true,
            Kid::Expr(e) => matches!(e.get_inner_expression(), Expression::JSXElement(_) | Expression::JSXFragment(_)),
            Kid::Text(_) => false,
        };
        if structure && (self.hydratable || self.ssr) {
            (format!("() => {v}"), true)
        } else {
            (v, false)
        }
    }

    /// Code that writes one attribute of `el` (`kind`: class, style, prop or attr): value `v`, previous `p`.
    fn write(&mut self, el: &str, kind: &str, name: &str, v: &str, p: &str) -> String {
        match kind {
            "class" => format!("{}({el}, {v}, {p})", self.helper("cls")),
            "style" => format!("{}({el}, {v}, {p})", self.helper("css")),
            "prop" if name == "value" || name == "defaultValue" => format!("({el}.{name} = {v} ?? \"\")"),
            "prop" => format!("({el}.{name} = {v})"),
            _ => format!("{}({el}, {name:?}, {v})", self.helper("attr")),
        }
    }

    /// `code` (an expression's text) is exactly the key of a keyed list it's inside.
    fn is_key(&self, code: &str) -> bool {
        if self.keys.is_empty() {
            return false;
        }
        let code: String = srcmap::strip(code).chars().filter(|c| !c.is_whitespace()).collect();
        let code = code.trim_start_matches('(').trim_end_matches(')');
        self.keys.iter().any(|k| k == code)
    }

    fn bind(&mut self, el: &str, dynamic: &[(&'static str, String, String)]) -> String {
        let bind = self.helper("bind");
        if let [(kind, name, e)] = dynamic {
            let a = self.write(el, kind, name, "v", "p");
            return format!("{bind}(() => ({e}), (v, p) => {{ v !== p && {a}; }});");
        }
        let values: Vec<&str> = dynamic.iter().map(|(_, _, e)| e.as_str()).collect();
        let mut body = String::new();
        for (i, (kind, name, _)) in dynamic.iter().enumerate() {
            let a = self.write(el, kind, name, &format!("v[{i}]"), &format!("p[{i}]"));
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
                inner if has_jsx_branch(inner) => {
                    // `c ? <A/> : <B/>`, `c && <A/>`: the hole tracks the condition through a memo, so a change
                    // that leaves it the same doesn't rebuild the branch (research 19 §3).
                    let (test, rest) = self.condition(inner);
                    let memo = self.helper("memo");
                    format!("(() => {{ const _c = {memo}(() => {test}); return () => {}; }})()", rest("_c()"))
                }
                _ => {
                    let code = self.expr(e);
                    if self.is_key(&code) { code } else { format!("() => ({code})") }
                }
            },
        }
    }

    /// A conditional's test and a function from the test's reader to the whole expression. Nested conditionals with
    /// JSX branches read their tests through memos of their own.
    fn condition(&mut self, e: &Expression<'_>) -> (String, Rest) {
        match e {
            Expression::ConditionalExpression(c) => {
                let test = self.expr(&c.test);
                let yes = self.branch(&c.consequent);
                let no = self.branch(&c.alternate);
                (test, Box::new(move |t| format!("{t} ? {yes} : {no}")))
            }
            Expression::LogicalExpression(l) => {
                let test = self.expr(&l.left);
                let right = self.branch(&l.right);
                let op = l.operator.as_str();
                (test, Box::new(move |t| format!("{t} {op} {right}")))
            }
            _ => unreachable!("has_jsx_branch only accepts conditionals"),
        }
    }

    fn branch(&mut self, e: &Expression<'_>) -> String {
        let inner = e.get_inner_expression();
        if has_jsx_branch(inner) {
            let (test, rest) = self.condition(inner);
            let memo = self.helper("memo");
            return format!("({})", rest(&format!("{memo}(() => {test})()")));
        }
        // A fragment around one expression lowers to an arrow, which can't be the right side of `&&` bare.
        let code = self.expr(e);
        if matches!(inner, Expression::JSXFragment(_)) { format!("({code})") } else { code }
    }

    fn fragment(&mut self, f: &JSXFragment<'_>) -> String {
        let code = self.fragment_value(f);
        self.explain(f.span, "<>".into(), &code);
        code
    }

    fn fragment_value(&mut self, f: &JSXFragment<'_>) -> String {
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
        let key = if name == "For" {
            self.uses_for = true;
            list_key(el)
        } else {
            None
        };
        let keyed = key.is_some();
        self.keys.extend(key);
        let island = if self.ssr { island_mark(el) } else { None };
        let mut fields = Vec::new();
        let kids = children(&el.children, self.text);
        match kids.as_slice() {
            [] => {}
            many if island.as_ref().is_some_and(|i| i.2) => {
                // The island's children stay the server's: a slot, rendered where the island reads it.
                let vs: Vec<String> = many.iter().map(|k| self.kid_value(k)).collect();
                let slot = self.helper("slot");
                fields.push(format!("get children() {{ return {slot}(() => [{}]); }}", vs.join(", ")));
            }
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
        if keyed {
            self.keys.pop();
        }
        let props = self.props(&el.opening_element.attributes, fields, false);
        let component = self.helper("component");
        let callee = match tag_read(el) {
            Some(read) => self.expr(read),
            None => name.clone(),
        };
        if let Some((id, values, slotted, when)) = island {
            let call = self.helper("island");
            let names = serde_json::to_string(&values).unwrap();
            let slotted = slotted && !kids.is_empty();
            let tail = match (slotted, when.is_empty()) {
                (true, true) => ", 1".to_string(),
                (false, true) => String::new(),
                (s, false) => format!(", {}, {when:?}", if s { "1" } else { "void 0" }),
            };
            return format!("{call}({id:?}, {names}, {callee}, {props}{tail})");
        }
        // Dev builds name the component, so a <Boundary> can say where an error was thrown.
        match self.origin.get(&el.span.start) {
            Some(&(line, _)) if self.dev && !self.ssr && name != "For" => {
                format!("{component}({callee}, {props}, {name:?}, {:?})", format!("{}:{line}", self.display))
            }
            _ => format!("{component}({callee}, {props})"),
        }
    }

    /// An element's attributes as one object literal, read in order on every run of its `spread` (later wins):
    /// `{ a: x, ...rest, b: y }`. `ref={el}` on a variable is a function that assigns it. `None` when an attribute's
    /// value is JSX, which must not be rebuilt on every run.
    fn spread_object(&mut self, attrs: &oxc_allocator::Vec<'_, JSXAttributeItem<'_>>) -> Option<String> {
        let mut fields: Vec<String> = Vec::new();
        for item in attrs {
            match item {
                JSXAttributeItem::SpreadAttribute(s) => {
                    // a spread element takes any assignment expression, so `...a ?? b` needs no parentheses
                    fields.push(format!("...{}", self.expr(&s.argument)));
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
                    fields.push(match &a.value {
                        None => format!("{k}: true"),
                        Some(JSXAttributeValue::StringLiteral(s)) => format!("{k}: {}", serde_json::to_string(&decode_entities(s.value.as_str())).unwrap()),
                        Some(JSXAttributeValue::ExpressionContainer(c)) => match c.expression.as_expression() {
                            None => continue,
                            Some(e) if key == "ref" && self.assignable(e) => format!("{k}: {}", self.assigner(e)),
                            Some(e) => format!("{k}: {}", self.expr(e)),
                        },
                        Some(JSXAttributeValue::Element(_) | JSXAttributeValue::Fragment(_)) => return None,
                    });
                }
            }
        }
        Some(format!("{{ {} }}", fields.join(", ")))
    }

    /// `ref={el}` beside a spread: a function that calls `el` with the element, or assigns it to `el`.
    fn assigner(&mut self, e: &Expression<'_>) -> String {
        let (r, call) = (self.expr(e), self.helper("ref"));
        format!("(_e) => {{ const _r = {r}; typeof _r === \"function\" || Array.isArray(_r) ? {call}(() => _r, _e) : ({r} = _e); }}")
    }

    /// Props from JSX attributes, in order: literals and plain values as fields, the rest as getters, spreads as
    /// `mergeProps` sources (later wins). `extra` fields go last. An `element`'s `ref={el}` may assign `el`.
    fn props(&mut self, attrs: &oxc_allocator::Vec<'_, JSXAttributeItem<'_>>, extra: Vec<String>, element: bool) -> String {
        let mut sources: Vec<String> = Vec::new();
        let mut fields: Vec<String> = Vec::new();
        for item in attrs {
            match item {
                JSXAttributeItem::SpreadAttribute(s) => {
                    if !fields.is_empty() {
                        sources.push(format!("{{ {} }}", fields.join(", ")));
                        fields.clear();
                    }
                    // `{...props.rest}` is read live: anything but a plain name is passed as a function.
                    let e = self.expr(&s.argument);
                    sources.push(if matches!(s.argument.get_inner_expression(), Expression::Identifier(_)) { e } else { format!("() => ({e})") });
                }
                JSXAttributeItem::Attribute(a) => {
                    let key = match &a.name {
                        JSXAttributeName::Identifier(id) => id.name.to_string(),
                        JSXAttributeName::NamespacedName(ns) => format!("{}:{}", ns.namespace.name, ns.name.name),
                    };
                    if key == "key" || key == TAG || key == ISLAND {
                        continue;
                    }
                    let k = prop_key(&key);
                    let field = match &a.value {
                        None => format!("{k}: true"),
                        Some(JSXAttributeValue::StringLiteral(s)) => format!("{k}: {}", serde_json::to_string(&decode_entities(s.value.as_str())).unwrap()),
                        Some(JSXAttributeValue::ExpressionContainer(c)) => match c.expression.as_expression() {
                            None => continue,
                            Some(e) if element && key == "ref" && self.assignable(e) => format!("{k}: {}", self.assigner(e)),
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
        fields.extend(extra);
        if sources.is_empty() {
            if fields.is_empty() { "{}".to_string() } else { format!("{{ {} }}", fields.join(", ")) }
        } else {
            if !fields.is_empty() {
                sources.push(format!("{{ {} }}", fields.join(", ")));
            }
            format!("{}({})", self.helper("mergeProps"), sources.join(", "))
        }
    }
}

/// Builds a conditional around its test's reader (`_c()`, or an inline memo).
type Rest = Box<dyn Fn(&str) -> String>;

/// `c ? a : b` or `c && a` / `c || a` / `c ?? a` where a branch holds JSX.
fn has_jsx_branch(e: &Expression<'_>) -> bool {
    let jsx = |e: &Expression<'_>| {
        let mut v = Outermost::default();
        v.visit_expression(e);
        !v.found.is_empty()
    };
    match e {
        Expression::ConditionalExpression(c) => jsx(&c.consequent) || jsx(&c.alternate),
        Expression::LogicalExpression(l) => jsx(&l.right),
        _ => false,
    }
}

// ---- helpers --------------------------------------------------------------------------------------------------

fn tag_name(name: &JSXElementName<'_>) -> String {
    match name {
        JSXElementName::Identifier(id) => id.name.to_string(),
        JSXElementName::IdentifierReference(r) => r.name.to_string(),
        JSXElementName::NamespacedName(n) => format!("{}:{}", n.namespace.name, n.name.name),
        JSXElementName::MemberExpression(m) => format!("….{}", m.property.name),
        JSXElementName::ThisExpression(_) => "this".into(),
    }
}

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

/// A keyed list's key as its rows read it: `by={(row) => row.a.b}` → `row().a.b` (rows get their item as an
/// accessor). Other `by` shapes give none.
fn list_key(el: &JSXElement<'_>) -> Option<String> {
    let by = el.opening_element.attributes.iter().find_map(|a| match a {
        JSXAttributeItem::Attribute(a) if matches!(&a.name, JSXAttributeName::Identifier(id) if id.name == "by") => attr_expression(a),
        _ => None,
    })?;
    let Expression::ArrowFunctionExpression(f) = by.get_inner_expression() else { return None };
    let [param] = f.params.items.as_slice() else { return None };
    let BindingPattern::BindingIdentifier(p) = &param.pattern else { return None };
    let body = f.get_expression()?;
    let mut path = Vec::new();
    let mut e = body.get_inner_expression();
    while let Expression::StaticMemberExpression(m) = e {
        path.push(m.property.name.as_str());
        e = m.object.get_inner_expression();
    }
    let Expression::Identifier(id) = e else { return None };
    if id.name != p.name || path.is_empty() {
        return None;
    }
    path.reverse();
    Some(format!("{}().{}", p.name, path.join(".")))
}

/// The island mark on a component's tag (`hydration::mark`).
fn island_mark(el: &JSXElement<'_>) -> Option<(String, Vec<String>, bool, String)> {
    el.opening_element.attributes.iter().find_map(|a| match a {
        JSXAttributeItem::Attribute(a) if matches!(&a.name, JSXAttributeName::Identifier(id) if id.name == ISLAND) => match &a.value {
            Some(JSXAttributeValue::StringLiteral(s)) => marked(s.value.as_str()),
            _ => None,
        },
        _ => None,
    })
}

/// The live read the pre-pass put beside a component's tag (`TAG`).
fn tag_read<'a>(el: &'a JSXElement<'a>) -> Option<&'a Expression<'a>> {
    el.opening_element.attributes.iter().find_map(|a| match a {
        JSXAttributeItem::Attribute(a) if matches!(&a.name, JSXAttributeName::Identifier(id) if id.name == TAG) => attr_expression(a),
        _ => None,
    })
}

fn is_component(el: &JSXElement<'_>, text: &str) -> bool {
    component_name(&el.opening_element.name, text).is_some()
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
