//! Every helper imported from core, core/internal, core/dom or core/ssr must exist in the runtime.
//! Compile the repo's components in DOM, DOM dev, hydratable DOM and SSR modes.

#![allow(
    clippy::unwrap_used,
    reason = "a panic in a test is the failure report"
)]

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use kerf_compiler::{Options, compile};
use oxc_allocator::Allocator;
use oxc_ast::ast::{Declaration, ImportDeclarationSpecifier, ModuleExportName, Statement};
use oxc_parser::Parser;
use oxc_span::SourceType;

/// Every `.tsx` under the given repo directories.
fn components() -> Vec<(String, String)> {
    let repo = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let mut out = Vec::new();
    let mut stack: Vec<_> = [
        "packages/core/test/fixtures",
        "packages/core/bench/fixtures",
        "evals/reference-v3/kerf/src",
    ]
    .iter()
    .map(|d| repo.join(d))
    .collect();
    while let Some(dir) = stack.pop() {
        for entry in std::fs::read_dir(&dir)
            .unwrap_or_else(|e| panic!("{}: {e}", dir.display()))
            .flatten()
        {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.extension().is_some_and(|e| e == "tsx") {
                let name = path.strip_prefix(&repo).unwrap().display().to_string();
                out.push((name, std::fs::read_to_string(&path).unwrap()));
            }
        }
    }
    out.sort();
    out
}

fn parse<'a>(
    allocator: &'a Allocator,
    source: &'a str,
    ty: SourceType,
) -> oxc_ast::ast::Program<'a> {
    let parsed = Parser::new(allocator, source, ty).parse();
    assert!(
        parsed.diagnostics.is_empty(),
        "parse: {:?}",
        parsed.diagnostics
    );
    parsed.program
}

fn export_name(n: &ModuleExportName<'_>) -> String {
    n.name().to_string()
}

/// Names a runtime module exports (`export function f`, `export const x`, `export { a, b }`).
fn exports_of(file: &Path) -> BTreeSet<String> {
    let source = std::fs::read_to_string(file).unwrap();
    let allocator = Allocator::default();
    let program = parse(&allocator, &source, SourceType::ts());
    let mut names = BTreeSet::new();
    for s in &program.body {
        let declaration = match s {
            Statement::ExportNamedDeclaration(e) => {
                names.extend(e.specifiers.iter().map(|s| export_name(&s.exported)));
                continue;
            }
            Statement::ExportFromDeclaration(e) => {
                names.extend(e.specifiers.iter().map(|s| export_name(&s.exported)));
                continue;
            }
            Statement::ExportDeclaration(e) => &e.declaration,
            _ => continue,
        };
        match declaration {
            Declaration::FunctionDeclaration(f) => {
                names.extend(f.id.as_ref().map(|i| i.name.to_string()));
            }
            Declaration::VariableDeclaration(v) => {
                names.extend(
                    v.declarations
                        .iter()
                        .filter_map(|d| d.id.get_identifier_name().map(|n| n.to_string())),
                );
            }
            Declaration::ClassDeclaration(c) => {
                names.extend(c.id.as_ref().map(|i| i.name.to_string()));
            }
            _ => {}
        }
    }
    names
}

/// `source → imported names` for every import in a compiled module.
fn imports_of(code: &str) -> BTreeMap<String, BTreeSet<String>> {
    let allocator = Allocator::default();
    let program = parse(&allocator, code, SourceType::tsx());
    let mut out: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for s in &program.body {
        let Statement::ImportDeclaration(i) = s else {
            continue;
        };
        if i.import_kind.is_type() {
            continue;
        }
        let names = out.entry(i.source.value.to_string()).or_default();
        for spec in i.specifiers.iter().flatten() {
            // Types aren't helpers (the host strips them).
            if let ImportDeclarationSpecifier::ImportSpecifier(s) = spec
                && !s.import_kind.is_type()
            {
                names.insert(export_name(&s.imported));
            }
        }
    }
    out
}

fn runtime_modules() -> BTreeMap<&'static str, BTreeSet<String>> {
    let runtime = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages/core/src");
    [
        ("@kerf-js/core", exports_of(&runtime.join("index.ts"))),
        (
            "@kerf-js/core/internal",
            exports_of(&runtime.join("internal.ts")),
        ),
        ("@kerf-js/core/dom", exports_of(&runtime.join("dom.ts"))),
        ("@kerf-js/core/ssr", exports_of(&runtime.join("ssr.ts"))),
    ]
    .into()
}

#[test]
fn every_helper_the_back_end_imports_exists_in_the_runtime() {
    let modules = runtime_modules();

    let files = components();
    assert!(
        files.len() >= 15,
        "found only {} components; did the fixtures move?",
        files.len()
    );
    let mut used: BTreeSet<String> = BTreeSet::new();
    let mut missing: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let modes = [
        ("dom", false, false),
        ("dom", true, false),
        ("dom", false, true),
        ("ssr", false, true),
    ];
    for (generate, dev, hydratable) in modes {
        for (name, source) in &files {
            let o = Options {
                filename: name.clone(),
                generate: generate.into(),
                dev,
                hydratable,
                ..Default::default()
            };
            let out = compile(source, &o);
            let code = out
                .code
                .unwrap_or_else(|| panic!("{name} ({generate}): {:?}", out.diagnostics));
            for (from, names) in imports_of(&code) {
                let Some(exports) = modules.get(from.as_str()) else {
                    continue;
                };
                for n in names {
                    used.insert(format!("{from}:{n}"));
                    if !exports.contains(&n) {
                        missing
                            .entry(format!("{from}:{n}"))
                            .or_default()
                            .insert(format!(
                                "{name} ({generate}, dev {dev}, hydratable {hydratable})"
                            ));
                    }
                }
            }
        }
    }
    assert!(
        missing.is_empty(),
        "helpers the back end imports but the runtime lacks:\n{missing:#?}"
    );
    // Guard against the check passing vacuously (e.g. the import source changing).
    for core in [
        "@kerf-js/core/internal:localProps",
        "@kerf-js/core/internal:restOf",
        "@kerf-js/core/dom:tpl",
        "@kerf-js/core/dom:child",
        "@kerf-js/core/dom:bind",
        "@kerf-js/core/dom:first",
        "@kerf-js/core/ssr:ssr",
        "@kerf-js/core/ssr:hole",
        "@kerf-js/core/ssr:key",
    ] {
        assert!(
            used.contains(core),
            "the components no longer import {core}; used: {used:?}"
        );
    }
}
