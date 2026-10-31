//! weft's TSX compiler, Phase 1 spike.
//!
//! One Oxc parse per file. `analyze` reads the program with scopes and symbols and produces a plan plus
//! diagnostics; `transform` applies the plan to the same AST (§3.3 props → live reads, §3.4 `.map` → keyed
//! list); then weft's back end (`emit`, research 19) lowers the JSX to template clones and fine-grained bindings
//! against weft's runtime (`weft/dom`), or to server code (`weft/ssr`).

mod analyze;
mod browser;
mod diag;
mod emit;
mod hmr;
pub mod hydration;
pub mod project;
mod react;
mod shape;
mod srcmap;
pub mod style;
mod transform;

#[cfg(feature = "node")]
mod node;

pub use diag::{Diagnostic, Edit, Fix, Severity};
pub use project::Facts;

use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::SourceType;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Options {
    pub filename: String,
    /// Runtime module the back end imports DOM helpers from.
    pub module_name: String,
    /// Run the analysis and diagnostics only (what `weft check` needs).
    pub check_only: bool,
    pub dev: bool,
    pub source_map: bool,
    /// `"dom"` (default) or `"ssr"`: the back end's output mode. SSR output imports from `weft/ssr`.
    pub generate: String,
    /// DOM output that adopts server-rendered nodes (`hydrate`), and SSR output that marks them.
    pub hydratable: bool,
    /// Also return what each JSX node became (`Output::explain`).
    pub explain: bool,
    /// Dev DOM output only, not hydratable: register components for hot updates and keep their state (weft/hmr).
    pub hmr: bool,
    /// Style groups defined in other modules, keyed `"<absolute path without extension>#<export>"` (style.rs).
    pub groups: std::collections::HashMap<String, style::Imported>,
    /// Group parts carry `data-g` as well as `data-part` (warp's `data-scope` + `data-part` shape). Off: parts carry
    /// only `data-part`, and the group's `@scope` tells them apart.
    pub tagged_parts: bool,
    /// Emit a shape variant of each component (research 31 §5). The value lists imported components that have one,
    /// keyed `"<absolute path without extension>#<export>"`. `None`: only what this file's `pending="shape"` needs.
    pub shapes: Option<std::collections::HashMap<String, bool>>,
    /// The sites the project's view made islands (hydration.rs). `None`: every component hydrates.
    pub islands: Option<hydration::Islands>,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            filename: "input.tsx".into(),
            module_name: "weft/dom".into(),
            check_only: false,
            dev: false,
            source_map: false,
            generate: "dom".into(),
            hydratable: false,
            explain: false,
            hmr: false,
            groups: Default::default(),
            tagged_parts: false,
            shapes: None,
            islands: None,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct Output {
    /// Compiled module. TypeScript syntax is kept; the host (Vite's Oxc pass) strips it.
    pub code: Option<String>,
    /// JSON source map back to the authored file, when `source_map` is set.
    pub map: Option<String>,
    pub diagnostics: Vec<Diagnostic>,
    /// Per-file facts for `weft check`'s project view (`project::link_w014`).
    pub facts: Facts,
    /// Each JSX node's lowering, by authored line (`explain`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub explain: Option<Vec<emit::Explained>>,
}

pub fn compile(source: &str, options: &Options) -> Output {
    let source_type = SourceType::from_path(&options.filename).unwrap_or_else(|_| SourceType::tsx());
    // DOM output keeps each island's call site as an export, appended so every pass reads it as authored code.
    let islands = options.islands.as_ref().filter(|i| !i.sites.is_empty() && !options.check_only);
    let hoisted = islands.filter(|_| options.generate != "ssr").and_then(|i| hydration::hoisted(source, source_type, i));
    let Some(hoisted) = hoisted else { return compile_source(source, source.len(), options) };
    compile_source(&format!("{source}{hoisted}"), source.len(), options)
}

fn compile_source(source: &str, authored: usize, options: &Options) -> Output {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(&options.filename).unwrap_or_else(|_| SourceType::tsx());
    let parsed = Parser::new(&allocator, source, source_type).parse();
    if !parsed.diagnostics.is_empty() || parsed.panicked {
        let diagnostics = parsed
            .diagnostics
            .iter()
            .map(|d| Diagnostic::syntax(source, d.to_string(), d.labels.first().map(|l| l.offset() as usize)))
            .collect();
        return Output { code: None, map: None, diagnostics, facts: Facts::default(), explain: None };
    }
    let mut program = parsed.program;

    let semantic = SemanticBuilder::new().build(&program).semantic;
    let plan = analyze::analyze(&program, semantic.scoping(), source);
    let scoping = semantic.into_scoping();
    let mut diagnostics = plan.diagnostics.clone();
    let hydration_facts = hydration::facts(&program, &scoping, source);
    // weft/browser checks; W054 needs to know whether this file is server-rendered (`None`: only checking).
    let ssr = if options.generate == "ssr" || options.hydratable { Some(true) } else if options.check_only { None } else { Some(false) };
    diagnostics.extend(browser::check(&program, &scoping, source, ssr));
    // Style groups: evaluate definitions and lower call sites to attributes before the pre-pass (style.rs).
    let (groups, group_uses) = style::apply(&allocator, &mut program, &scoping, source, &options.filename, &options.groups, options.tagged_parts, &mut diagnostics);
    diagnostics.retain(|d| (d.start as usize) <= authored);
    diagnostics.sort_by_key(|d| d.start);
    let mut facts = plan.facts.clone();
    facts.hydration = hydration_facts;
    facts.groups = groups;
    facts.group_uses = group_uses;
    if options.check_only {
        facts.shapes = shape::exports(&program);
        return Output { code: None, map: None, diagnostics, facts, explain: None };
    }

    // Before the pre-pass, which rewrites the params and lists the variants copy. Appended after printing.
    let shapes = shape::apply(&allocator, &mut program, &scoping, source, &options.filename, options.shapes.as_ref());
    facts.shapes = shapes.exports;

    if options.generate == "ssr"
        && options.hydratable
        && let Some(islands) = &options.islands
    {
        hydration::mark(&allocator, &mut program, &scoping, islands);
    }
    transform::apply(&allocator, &mut program, &scoping, &plan);

    let ssr = options.generate == "ssr";
    let footer = (options.hmr && options.dev && !ssr && !options.hydratable)
        .then(|| hmr::apply(&allocator, &mut program, source, &options.filename))
        .flatten();
    // Dev DOM output names its boxes and derived values for the graph (`weft browser`, the overlay).
    let names = (options.dev && !ssr).then(|| hmr::names(&allocator, &mut program, &options.filename)).flatten();
    let footer = match (footer, names) {
        (Some(a), Some(b)) => Some(a + &b),
        (a, b) => a.or(b),
    };
    // Print the pre-pass's AST and lower its JSX from that text (spans index it). Codegen's map of the printed text
    // goes through the emitter to the authored file. Each JSX node's authored line goes along by order
    // (`JsxOrder`), for dev comments and `explain`. Nodes the pre-pass made have no span.
    let mut order = emit::JsxOrder::default();
    oxc_ast_visit::Visit::visit_program(&mut order, &program);
    let origins = order.spans.iter().map(|s| (s.end > 0).then(|| diag::line_col(source, s.start))).collect();
    let opts = oxc_codegen::CodegenOptions { source_map_path: options.source_map.then(|| options.filename.clone().into()), ..Default::default() };
    let built = oxc_codegen::Codegen::new().with_options(opts).build(&program);
    let printed = built.code + &shapes.code;
    let points = built.map.as_ref().map(|m| srcmap::points(&printed, m));
    let module = if ssr && options.module_name == "weft/dom" { "weft/ssr" } else { &options.module_name };
    let display = display_path(&options.filename);
    let o = emit::EmitOptions {
        filename: &options.filename, display: &display, module, ssr, hydratable: options.hydratable, dev: options.dev, origins,
        map: points.as_ref().map(|p| (p, source)),
    };
    match emit::emit(&printed, o) {
        Ok(out) => Output { code: Some(out.code + footer.as_deref().unwrap_or("")), map: out.map, diagnostics, facts, explain: options.explain.then_some(out.explain) },
        Err(e) => {
            diagnostics.push(Diagnostic::syntax(&printed, e.message, Some(e.offset as usize)));
            Output { code: None, map: None, diagnostics, facts, explain: None }
        }
    }
}

/// `filename` relative to the working directory when it's inside it (dev comments, `weft explain`).
fn display_path(filename: &str) -> String {
    let path = std::path::Path::new(filename);
    std::env::current_dir().ok().and_then(|cwd| path.strip_prefix(cwd).ok().map(|p| p.display().to_string())).unwrap_or_else(|| filename.to_string())
}
