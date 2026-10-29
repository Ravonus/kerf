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
pub mod project;
mod srcmap;
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
    // weft/browser checks; W054 needs to know whether this file is server-rendered (`None`: only checking).
    let ssr = if options.generate == "ssr" || options.hydratable { Some(true) } else if options.check_only { None } else { Some(false) };
    diagnostics.extend(browser::check(&program, &scoping, source, ssr));
    diagnostics.sort_by_key(|d| d.start);
    let facts = plan.facts.clone();
    if options.check_only {
        return Output { code: None, map: None, diagnostics, facts, explain: None };
    }

    transform::apply(&allocator, &mut program, &scoping, &plan);

    let ssr = options.generate == "ssr";
    // Print the pre-pass's AST and lower its JSX from that text (spans index it). Codegen's map of the printed text
    // goes through the emitter to the authored file. Each JSX node's authored line goes along by order
    // (`JsxOrder`), for dev comments and `explain`. Nodes the pre-pass made have no span.
    let mut order = emit::JsxOrder::default();
    oxc_ast_visit::Visit::visit_program(&mut order, &program);
    let origins = order.spans.iter().map(|s| (s.end > 0).then(|| diag::line_col(source, s.start))).collect();
    let opts = oxc_codegen::CodegenOptions { source_map_path: options.source_map.then(|| options.filename.clone().into()), ..Default::default() };
    let built = oxc_codegen::Codegen::new().with_options(opts).build(&program);
    let printed = built.code;
    let points = built.map.as_ref().map(|m| srcmap::points(&printed, m));
    let module = if ssr && options.module_name == "weft/dom" { "weft/ssr" } else { &options.module_name };
    let display = display_path(&options.filename);
    let o = emit::EmitOptions {
        filename: &options.filename, display: &display, module, ssr, hydratable: options.hydratable, dev: options.dev, origins,
        map: points.as_ref().map(|p| (p, source)),
    };
    match emit::emit(&printed, o) {
        Ok(out) => Output { code: Some(out.code), map: out.map, diagnostics, facts, explain: options.explain.then_some(out.explain) },
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
