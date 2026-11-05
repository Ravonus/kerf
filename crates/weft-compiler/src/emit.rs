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

mod attrs;
mod children;
mod component;
mod constants;
mod helpers;
mod list;
mod lower;
mod props;
mod template;
mod values;
mod walk;

use self::constants::{DELEGATED, PROPERTIES, SVG, VOID};
use self::helpers::{
    Static, attr_expression, children, component_name, decode_entities, escape_attr, escape_text,
    has_jsx, has_jsx_branch, is_component, island_mark, passes_as_value, prop_key, static_value,
    tag_name, tag_read,
};
pub(crate) use self::list::set_off;
use self::list::{flag_off, hoist_key, list_key};

use std::collections::{BTreeSet, HashMap};
use std::fmt::Write as _;

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    BindingPattern, Expression, JSXAttribute, JSXAttributeItem, JSXAttributeName,
    JSXAttributeValue, JSXChild, JSXElement, JSXElementName, JSXFragment, ObjectExpression,
    ObjectPropertyKind, Program, PropertyKind, Statement,
};
use oxc_ast_visit::{Visit, walk as visit_walk};
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType, Span};

use crate::hydration::{ISLAND, marked};
use crate::{react, srcmap};

/// The attribute the pre-pass adds to a component tag it can't rewrite in place: its value is the live read of the tag.
pub const TAG: &str = "_$tag";

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
        self.found.push(Jsx::El(unsafe {
            &*std::ptr::from_ref::<JSXElement<'a>>(it)
        }));
    }
    fn visit_jsx_fragment(&mut self, it: &JSXFragment<'a>) {
        // SAFETY: as above.
        self.found.push(Jsx::Frag(unsafe {
            &*std::ptr::from_ref::<JSXFragment<'a>>(it)
        }));
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
        visit_walk::walk_jsx_element(self, it);
    }
    fn visit_jsx_fragment(&mut self, it: &JSXFragment<'a>) {
        self.spans.push(it.span);
        visit_walk::walk_jsx_fragment(self, it);
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

/// A string as a JS literal.
fn js_string(s: &str) -> String {
    serde_json::to_string(s).expect("a string always serializes")
}

/// Compile the pre-pass's printed program to DOM code (or server code, `ssr`) importing from `module`.
pub fn emit(code: &str, o: &EmitOptions) -> Result<Emitted, Error> {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(o.filename).unwrap_or_else(|_| SourceType::tsx());
    let parsed = Parser::new(&allocator, code, source_type).parse();
    if let Some(d) = parsed.diagnostics.first() {
        return Err(Error {
            message: format!("weft back end: the printed pre-pass output didn't parse: {d}"),
            offset: 0,
        });
    }
    let program = parsed.program;
    // Resolves `ref={x}`: a `let` is assigned the element, a const or an import is called with it.
    let scoping = code.contains("ref").then(|| {
        oxc_semantic::SemanticBuilder::new()
            .build(&program)
            .semantic
            .into_scoping()
    });
    let mut order = JsxOrder::default();
    order.visit_program(&program);
    // Fewer origins than nodes: shape variants, appended after the authored code, have no line. Any other difference
    // and the mapping can't be trusted: no lines rather than wrong ones.
    let origin = if order.spans.len() >= o.origins.len() {
        order
            .spans
            .iter()
            .zip(&o.origins)
            .filter_map(|(s, l)| l.map(|l| (s.start, l)))
            .collect()
    } else {
        HashMap::new()
    };
    let mut e = Emitter {
        text: code,
        templates: Vec::new(),
        helpers: BTreeSet::new(),
        delegated: BTreeSet::new(),
        uses_for: false,
        n: 0,
        error: None,
        ssr: o.ssr,
        hydratable: o.hydratable && !o.ssr,
        dev: o.dev,
        display: o.display.to_string(),
        origin,
        explained: Vec::new(),
        keys: Vec::new(),
        scoping,
    };
    let mut top = Outermost::default();
    top.visit_program(&program);
    // Imports hold no JSX: they're copied as they are, and the templates go after them.
    let split = imports_end(&program);
    let imports = srcmap::copy(code, 0, split);
    let body = e.splice(Span::new(split as u32, code.len() as u32), &top.found);
    if let Some(err) = e.error.take() {
        return Err(err);
    }

    Ok(finish(e, &program, o, &imports, split, &body))
}

fn finish(
    mut e: Emitter<'_>,
    program: &Program<'_>,
    o: &EmitOptions<'_>,
    imports: &str,
    split: usize,
    body: &str,
) -> Emitted {
    let code = e.text;
    let module = o.module;
    let mut head = String::new();
    if !e.helpers.is_empty() {
        let names: Vec<String> = e.helpers.iter().map(|h| format!("{h} as _${h}")).collect();
        let _ = writeln!(head, "import {{ {} }} from {:?};", names.join(", "), module);
    }
    if e.uses_for && !imports_binding(program, "For") {
        let _ = writeln!(head, "import {{ For }} from {module:?};");
    }
    // Templates go after the module's imports, so a reader meets the imports first.
    let mut out = head + imports;
    if split > 0 && !code[..split].ends_with('\n') {
        out.push('\n');
    }
    for t in &e.templates {
        out.push_str(t);
        out.push('\n');
    }
    out.push_str(&trim_marked_newlines(body));
    if !e.delegated.is_empty() {
        let names: Vec<String> = e.delegated.iter().map(|n| format!("{n:?}")).collect();
        let _ = writeln!(out, "\n_$delegate([{}]);", names.join(", "));
    }
    e.explained.sort_by_key(|x| (x.line, x.column));
    let (out, map) = srcmap::decode(
        &out,
        o.map.map(|(points, source)| srcmap::Mapping {
            points,
            file: o.filename,
            source,
        }),
    );
    Emitted {
        code: out,
        map,
        explain: e.explained,
    }
}

/// `body` without its leading newlines (they follow the imports), keeping its first marker in place.
fn trim_marked_newlines(body: &str) -> String {
    let marker_end = if body.starts_with('\u{E000}') {
        body.find('\u{E003}')
            .map_or(0, |i| i + '\u{E003}'.len_utf8())
    } else {
        0
    };
    let (marker, rest) = body.split_at(marker_end);
    let trimmed = rest.trim_start_matches('\n');
    if marker.is_empty() || trimmed.len() == rest.len() {
        return format!("{marker}{trimmed}");
    }
    // The copy now starts later in the printed text: renumber its marker.
    let at: usize = marker
        .trim_matches(|c| c == '\u{E000}' || c == '\u{E003}')
        .parse()
        .unwrap_or(0);
    format!(
        "\u{E000}{}\u{E003}{trimmed}",
        at + rest.len() - trimmed.len()
    )
}

/// Byte offset just past the module's leading imports (0 if none). An import after other code stays where it is in
/// the body (imports are hoisted anyway), so JSX before it is still lowered.
fn imports_end(program: &Program) -> usize {
    program
        .body
        .iter()
        .map_while(|s| match s {
            Statement::ImportDeclaration(i) => Some(i.span.end as usize),
            _ => None,
        })
        .last()
        .unwrap_or(0)
}

fn imports_binding(program: &Program, name: &str) -> bool {
    program.body.iter().any(|s| match s {
        Statement::ImportDeclaration(i) => i
            .specifiers
            .iter()
            .flatten()
            .any(|sp| sp.local().name == name),
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

/// Builds a conditional around its test's reader (`_c()`, or an inline memo).
type Rest = Box<dyn Fn(&str) -> String>;
