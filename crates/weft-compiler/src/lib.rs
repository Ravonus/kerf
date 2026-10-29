//! weft's TSX compiler, Phase 1 spike.
//!
//! One Oxc parse per file. `analyze` reads the program with scopes and symbols and produces a plan plus
//! diagnostics; `transform` applies the plan to the same AST (§3.3 props → live reads, §3.4 `.map` → keyed
//! list); then Solid 2's DOM back end (`solidjs_compiler::compile_program`, pinned and unmodified) does
//! template cloning and fine-grained bindings against weft's runtime (`weft/dom`).

mod analyze;
mod diag;
pub mod project;
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
}

impl Default for Options {
    fn default() -> Self {
        Self { filename: "input.tsx".into(), module_name: "weft/dom".into(), check_only: false, dev: false, source_map: false }
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
        return Output { code: None, map: None, diagnostics, facts: Facts::default() };
    }
    let mut program = parsed.program;

    let semantic = SemanticBuilder::new().build(&program).semantic;
    let plan = analyze::analyze(&program, semantic.scoping(), source);
    let scoping = semantic.into_scoping();
    let mut diagnostics = plan.diagnostics.clone();
    let facts = plan.facts.clone();
    if options.check_only {
        return Output { code: None, map: None, diagnostics, facts };
    }

    transform::apply(&allocator, &mut program, &scoping, &plan);

    let solid = solidjs_compiler::CompileOptions {
        filename: Some(options.filename.clone()),
        module_name: options.module_name.clone(),
        dev: options.dev,
        source_map: options.source_map,
        // weft has one list primitive. `For` is emitted only by the pre-pass and auto-imported from weft/dom.
        built_ins: vec!["For".into()],
        ..Default::default()
    };
    match solidjs_compiler::compile_program(&allocator, program, source, &solid) {
        Ok(out) => Output { code: Some(out.code), map: out.source_map, diagnostics, facts },
        Err(error) => {
            diagnostics.push(Diagnostic::syntax(source, error.to_string(), None));
            Output { code: None, map: None, diagnostics, facts }
        }
    }
}
