//! weft's TSX compiler, Phase 1 spike.
//!
//! One Oxc parse per file. `analyze` reads the program with scopes and symbols and produces a plan plus
//! diagnostics; `transform` applies the plan to the same AST (§3.3 props → live reads, §3.4 `.map` → keyed
//! list); then Solid 2's DOM back end (`solidjs_compiler::compile_program`, pinned and unmodified) does
//! template cloning and fine-grained bindings against weft's runtime (`weft/dom`).

mod analyze;
mod diag;
mod emit;
mod snippet;
mod transform;

#[cfg(feature = "node")]
mod node;

pub use diag::{Diagnostic, Edit, Fix, Severity};

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
    /// Dev names from the back end: component labels, binding labels and source locations (dev builds only).
    pub source_names: bool,
    /// `"solid"` (default) or `"weft"`: weft's own back end (research 19). SSR and hydratable output always use weft's.
    pub backend: String,
    /// Also return what each JSX node became (`Output::explain`, weft's back end only).
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
            source_names: false,
            backend: "solid".into(),
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
        return Output { code: None, map: None, diagnostics, explain: None };
    }
    let mut program = parsed.program;

    let semantic = SemanticBuilder::new().build(&program).semantic;
    let plan = analyze::analyze(&program, semantic.scoping(), source);
    let scoping = semantic.into_scoping();
    let mut diagnostics = plan.diagnostics.clone();
    if options.check_only {
        return Output { code: None, map: None, diagnostics, explain: None };
    }

    transform::apply(&allocator, &mut program, &scoping, &plan, source);

    let ssr = options.generate == "ssr";
    // SSR and hydration exist only on weft's back end (research 19 step 3); the runtime has no other key scheme.
    if options.backend == "weft" || ssr || options.hydratable {
        // Print the pre-pass's AST and lower its JSX from that text (spans index it). No source map yet; each JSX
        // node's authored line goes along by order (`JsxOrder`). Nodes the pre-pass made have no span.
        let mut order = emit::JsxOrder::default();
        oxc_ast_visit::Visit::visit_program(&mut order, &program);
        let origins = order.spans.iter().map(|s| (s.end > 0).then(|| diag::line_col(source, s.start))).collect();
        let printed = oxc_codegen::Codegen::new().build(&program).code;
        let module = if ssr && options.module_name == "weft/dom" { "weft/ssr" } else { &options.module_name };
        let display = display_path(&options.filename);
        let o = emit::EmitOptions { filename: &options.filename, display: &display, module, ssr, hydratable: options.hydratable, dev: options.dev, origins };
        return match emit::emit(&printed, o) {
            Ok(out) => Output { code: Some(out.code), map: None, diagnostics, explain: options.explain.then_some(out.explain) },
            Err(e) => {
                diagnostics.push(Diagnostic::syntax(&printed, e.message, Some(e.offset as usize)));
                Output { code: None, map: None, diagnostics, explain: None }
            }
        };
    }
    let solid = solidjs_compiler::CompileOptions {
        filename: Some(options.filename.clone()),
        // SSR output has its own runtime; a caller-set module name (tests, fixtures) wins.
        module_name: if ssr && options.module_name == "weft/dom" { "weft/ssr".into() } else { options.module_name.clone() },
        generate: if ssr { solidjs_compiler::Generate::Ssr } else { solidjs_compiler::Generate::Dom },
        hydratable: options.hydratable,
        source_names: solidjs_compiler::SourceNames::all(options.source_names && options.dev),
        dev: options.dev,
        source_map: options.source_map,
        // weft has one list primitive. `For` is emitted only by the pre-pass and auto-imported from weft/dom.
        built_ins: vec!["For".into()],
        ..Default::default()
    };
    match solidjs_compiler::compile_program(&allocator, program, source, &solid) {
        Ok(out) => Output { code: Some(out.code), map: out.source_map, diagnostics, explain: None },
        Err(error) => {
            diagnostics.push(Diagnostic::syntax(source, error.to_string(), None));
            Output { code: None, map: None, diagnostics, explain: None }
        }
    }
}

/// `filename` relative to the working directory when it's inside it (dev comments, `weft explain`).
fn display_path(filename: &str) -> String {
    let path = std::path::Path::new(filename);
    std::env::current_dir().ok().and_then(|cwd| path.strip_prefix(cwd).ok().map(|p| p.display().to_string())).unwrap_or_else(|| filename.to_string())
}
