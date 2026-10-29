//! Helper contract (research 16 §6.3): the back end's import surface is unversioned and differs by mode, so a
//! Solid bump can start importing a helper weft's runtime doesn't have. Compile upstream's DOM fixture corpus at
//! the pinned rev, exactly as weft does (`moduleName: "weft/dom"`, dev and prod), and check that every helper the
//! output imports from `weft` or `weft/dom` is exported by `packages/weft/src`.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::process::Command;

use oxc_allocator::Allocator;
use oxc_ast::ast::{Declaration, ImportDeclarationSpecifier, ModuleExportName, Statement};
use oxc_parser::Parser;
use oxc_span::SourceType;
use weft_compiler::{Options, compile};

/// `packages/compiler` of the pinned `solidjs-compiler` checkout, from cargo's own resolution.
fn solid_checkout() -> PathBuf {
    let cargo = std::env::var("CARGO").unwrap_or_else(|_| "cargo".into());
    let out = Command::new(cargo)
        .args(["metadata", "--format-version", "1", "--offline", "--manifest-path"])
        .arg(Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml"))
        .output()
        .expect("cargo metadata");
    let meta: serde_json::Value = serde_json::from_slice(&out.stdout).expect("metadata json");
    let manifest = meta["packages"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["name"] == "solidjs-compiler")
        .and_then(|p| p["manifest_path"].as_str())
        .expect("solidjs-compiler in the dependency graph");
    Path::new(manifest).parent().unwrap().to_path_buf()
}

/// Every non-hydratable DOM fixture input (`code.js`) in the babel-plugin corpus the compiler's suite runs.
fn dom_fixtures() -> Vec<(String, String)> {
    let root = solid_checkout().join("../babel-plugin/test");
    let mut out = Vec::new();
    for dir in std::fs::read_dir(&root).expect("babel-plugin fixtures").flatten() {
        let name = dir.file_name().to_string_lossy().to_string();
        if !name.starts_with("__dom") || name.contains("hydratable") {
            continue;
        }
        for case in std::fs::read_dir(dir.path()).unwrap().flatten() {
            let code = case.path().join("code.js");
            if let Ok(src) = std::fs::read_to_string(&code) {
                out.push((format!("{name}/{}", case.file_name().to_string_lossy()), src));
            }
        }
    }
    out.sort();
    out
}

fn parse<'a>(allocator: &'a Allocator, source: &'a str, ty: SourceType) -> oxc_ast::ast::Program<'a> {
    let parsed = Parser::new(allocator, source, ty).parse();
    assert!(parsed.diagnostics.is_empty(), "parse: {:?}", parsed.diagnostics);
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
            Declaration::FunctionDeclaration(f) => names.extend(f.id.as_ref().map(|i| i.name.to_string())),
            Declaration::VariableDeclaration(v) => {
                names.extend(v.declarations.iter().filter_map(|d| d.id.get_identifier_name().map(|n| n.to_string())))
            }
            Declaration::ClassDeclaration(c) => names.extend(c.id.as_ref().map(|i| i.name.to_string())),
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
        let Statement::ImportDeclaration(i) = s else { continue };
        let names = out.entry(i.source.value.to_string()).or_default();
        for spec in i.specifiers.iter().flatten() {
            if let ImportDeclarationSpecifier::ImportSpecifier(s) = spec {
                names.insert(export_name(&s.imported));
            }
        }
    }
    out
}

#[test]
fn every_helper_the_back_end_imports_exists_in_the_runtime() {
    let runtime = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages/weft/src");
    let modules: BTreeMap<&str, BTreeSet<String>> =
        [("weft", exports_of(&runtime.join("index.ts"))), ("weft/dom", exports_of(&runtime.join("dom.ts")))].into();

    let fixtures = dom_fixtures();
    assert!(fixtures.len() >= 30, "found only {} fixtures; did the corpus move?", fixtures.len());
    let mut used: BTreeSet<String> = BTreeSet::new();
    let mut missing: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut unparsed: BTreeSet<&str> = BTreeSet::new();
    for dev in [false, true] {
        for (name, source) in &fixtures {
            let out = compile(source, &Options { filename: "code.jsx".into(), dev, ..Default::default() });
            // A few fixtures use syntax Oxc's TSX parser rejects (`<a:b-c>` namespace names); weft can't see
            // those files either, so they can't reach the back end.
            let Some(code) = out.code else {
                assert!(out.diagnostics.iter().all(|d| d.code == "W000"), "{name}: {:?}", out.diagnostics);
                unparsed.insert(name.as_str());
                continue;
            };
            for (from, names) in imports_of(&code) {
                let Some(exports) = modules.get(from.as_str()) else { continue };
                for n in names {
                    used.insert(format!("{from}:{n}"));
                    if !exports.contains(&n) {
                        missing.entry(format!("{from}:{n}")).or_default().insert(format!("{name} (dev: {dev})"));
                    }
                }
            }
        }
    }
    assert!(unparsed.len() <= 2, "too many fixtures fail weft's parse: {unparsed:?}");
    assert!(missing.is_empty(), "helpers the back end imports but the runtime lacks:\n{missing:#?}");
    // Guard against the check passing vacuously (e.g. the import source changing).
    for core in ["weft/dom:template", "weft/dom:insert", "weft/dom:effect", "weft/dom:setStatefulProperty"] {
        assert!(used.contains(core), "corpus no longer imports {core}; used: {used:?}");
    }
}
