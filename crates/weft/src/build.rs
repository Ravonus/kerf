//! `weft::build::generate("search")` in a sidecar's `build.rs`: `.weft/contract.json` → serde types (typify), a typed
//! error enum per function, the `Service` trait and `functions()`. Rust never defines a schema (PLAN §4.3). A contract
//! that changes reruns this, and cargo then stops exactly where the implementation no longer fits, which `weft dev`,
//! `weft build` and `weft check` report as R103 with the function's id.

use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use schemars::schema::{RootSchema, Schema};
use serde_json::{Map, Value, json};
use typify::{TypeSpace, TypeSpaceSettings};

/// Generate the contract for `service` into `OUT_DIR/weft_contract.rs`, and a copy to read at `.weft/rust/<service>.rs`.
///
/// # Panics
/// When there's no contract or `service` has no functions. A build script reports failure by panicking; the message is
/// R103 with the fix.
pub fn generate(service: &str) {
    println!("cargo:rerun-if-env-changed=WEFT_CONTRACT");
    let path = contract_path().unwrap_or_else(|| panic!("R103: no .weft/contract.json above this crate. Run `weft dev` or `weft check` in the app, or set WEFT_CONTRACT"));
    println!("cargo:rerun-if-changed={}", path.display());
    let text = fs::read_to_string(&path).unwrap_or_else(|e| panic!("R103: can't read {}: {e}", path.display()));
    let contract: Value = serde_json::from_str(&text).unwrap_or_else(|e| panic!("R103: {} isn't JSON: {e}", path.display()));
    let code = render(&contract, service).unwrap_or_else(|e| panic!("R103: {e}"));
    let out = PathBuf::from(env::var("OUT_DIR").expect("cargo sets OUT_DIR")).join("weft_contract.rs");
    fs::write(&out, &code).expect("OUT_DIR is writable");
    if let Some(dir) = path.parent().map(|p| p.join("rust")) {
        let _ = fs::create_dir_all(&dir);
        let _ = fs::write(dir.join(format!("{service}.rs")), &code); // to read: a build doesn't depend on it
    }
}

/// `WEFT_CONTRACT`, or the nearest `.weft/contract.json` above the crate.
fn contract_path() -> Option<PathBuf> {
    if let Ok(p) = env::var("WEFT_CONTRACT") {
        return Some(PathBuf::from(p));
    }
    let dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").ok()?);
    dir.ancestors().map(|d: &Path| d.join(".weft/contract.json")).find(|p| p.exists())
}

/// `searchDocs` → `search_docs`, kept clear of what a method can't be called.
fn snake(name: &str) -> String {
    let mut out = String::new();
    for (i, c) in name.chars().enumerate() {
        if c.is_ascii_uppercase() {
            if i > 0 {
                out.push('_');
            }
            out.push(c.to_ascii_lowercase());
        } else if c.is_alphanumeric() || c == '_' {
            out.push(c);
        }
    }
    if syn::parse_str::<syn::Ident>(&out).is_err() { format!("{out}_") } else { out }
}

/// `searchDocs` → `SearchDocs`.
fn pascal(name: &str) -> String {
    let clean: String = name.chars().filter(|c| c.is_alphanumeric() || *c == '_').collect();
    let mut chars = clean.chars();
    chars.next().map_or(String::new(), |c| c.to_uppercase().chain(chars).collect())
}

/// typify reads schemars 0.8 schemas, which spell a tuple `items: […]`. Zod's `$defs` are collected by the caller.
fn normal(v: &Value, defs: &mut BTreeMap<String, Value>) -> Value {
    match v {
        Value::Object(m) => {
            let mut out = Map::new();
            for (k, x) in m {
                match k.as_str() {
                    "$schema" => {}
                    "$defs" | "definitions" => {
                        for (name, def) in x.as_object().into_iter().flatten() {
                            let def = normal(def, defs);
                            defs.insert(name.clone(), def);
                        }
                    }
                    "prefixItems" => {
                        out.insert("items".into(), normal(x, defs));
                    }
                    "$ref" => {
                        out.insert(k.clone(), json!(x.as_str().unwrap_or("").replace("#/$defs/", "#/definitions/")));
                    }
                    _ => {
                        out.insert(k.clone(), normal(x, defs));
                    }
                }
            }
            Value::Object(out)
        }
        Value::Array(a) => Value::Array(a.iter().map(|x| normal(x, defs)).collect()),
        x => x.clone(),
    }
}

struct Spec<'a> {
    id: &'a str,
    method: String,
    type_name: String,
    ctx: &'static str,
    input: Option<Value>,
    output: Value,
    errors: Vec<(String, Value)>,
}

fn specs<'a>(functions: &[&'a Value], defs: &mut BTreeMap<String, Value>) -> Vec<Spec<'a>> {
    let mut seen = BTreeMap::<String, usize>::new();
    for f in functions {
        *seen.entry(f["name"].as_str().unwrap_or("").to_string()).or_default() += 1;
    }
    functions
        .iter()
        .map(|f| {
            let id = f["id"].as_str().unwrap_or("");
            let name = f["name"].as_str().unwrap_or(id);
            // Two files can export one name: the id's hash keeps them apart.
            let unique = if seen[name] > 1 { id.replace('.', "_") } else { name.to_string() };
            let imp = &f["impl"];
            Spec {
                id,
                method: snake(&unique),
                type_name: pascal(&unique),
                ctx: match imp["ctx"].as_str() {
                    Some("shared") => "SharedCtx",
                    Some("user") => "UserCtx",
                    _ => "Ctx",
                },
                input: (!f["input"].is_null()).then(|| normal(&f["input"], defs)),
                output: normal(&imp["output"], defs),
                errors: imp["errors"].as_object().into_iter().flatten().map(|(k, v)| (k.clone(), normal(v, defs))).collect(),
            }
        })
        .collect()
}

fn add(space: &mut TypeSpace, schema: &Value, name: &str) -> Result<String, String> {
    let root: RootSchema = serde_json::from_value(schema.clone()).map_err(|e| format!("`{name}` isn't a schema typify reads: {e}"))?;
    let id = space.add_type_with_name(&Schema::Object(root.schema), Some(name.to_string())).map_err(|e| format!("`{name}`: {e}"))?;
    Ok(space.get_type(&id).map_err(|e| e.to_string())?.ident().to_string())
}

/// `pub type X = …` unless typify already named the type `X`.
fn alias(name: &str, ident: &str) -> String {
    if ident.replace(' ', "") == name { String::new() } else { format!("pub type {name} = {ident};\n") }
}

/// The Rust for `service`'s functions.
pub(crate) fn render(contract: &Value, service: &str) -> Result<String, String> {
    let all = contract["functions"].as_array().ok_or("the contract has no `functions`")?;
    let functions: Vec<&Value> = all.iter().filter(|f| f["impl"]["service"] == service).collect();
    if functions.is_empty() {
        return Err(format!("no function in the contract has `impl: remote('rust://{service}')`. Point one at it, or rename the service in build.rs"));
    }
    let hash = contract["services"][service]["hash"].as_str().unwrap_or("");

    let mut defs = BTreeMap::new();
    let specs = specs(&functions, &mut defs);
    let mut settings = TypeSpaceSettings::default();
    settings.with_struct_builder(false);
    let mut space = TypeSpace::new(&settings);
    let mut extra = String::new();
    let mut body = String::new();

    let refs = defs.into_iter().map(|(k, v)| serde_json::from_value::<Schema>(v).map(|s| (k.clone(), s)).map_err(|e| format!("`$defs/{k}`: {e}"))).collect::<Result<Vec<_>, _>>()?;
    space.add_ref_types(refs).map_err(|e| format!("named schemas: {e}"))?;

    let mut methods = String::new();
    let mut table = String::new();
    for s in &specs {
        let name = &s.type_name;
        let input = match &s.input {
            Some(schema) => {
                extra += &alias(&format!("{name}Input"), &add(&mut space, schema, &format!("{name}Input"))?);
                format!(", input: {name}Input")
            }
            None => String::new(),
        };
        extra += &alias(&format!("{name}Output"), &add(&mut space, &s.output, &format!("{name}Output"))?);

        let error = if s.errors.is_empty() {
            "::weft::Error".to_string()
        } else {
            let mut variants = String::new();
            for (code, schema) in &s.errors {
                let data = format!("{name}{code}");
                extra += &alias(&data, &add(&mut space, schema, &data)?);
                variants += &format!("{code}({data}),\n");
            }
            body += &format!(
                r#"
/// `{id}`'s declared errors, and `Internal` for the rest: any `std::error::Error` converts, so `?` works.
#[derive(Debug, ::serde::Serialize)]
#[serde(tag = "code", content = "data")]
pub enum {name}Error {{
    {variants}
    #[serde(skip)]
    Internal(::std::string::String),
}}
impl<E: ::std::error::Error> ::std::convert::From<E> for {name}Error {{
    fn from(e: E) -> Self {{ Self::Internal(e.to_string()) }}
}}
impl ::weft::Failure for {name}Error {{
    fn failed(self) -> ::weft::Failed {{
        match self {{
            Self::Internal(detail) => ::weft::Failed::Internal(detail),
            typed => match ::serde_json::to_value(typed) {{
                Ok(v) => ::weft::Failed::Typed(v),
                Err(e) => ::weft::Failed::Internal(e.to_string()),
            }},
        }}
    }}
}}
"#,
                id = s.id,
            );
            format!("{name}Error")
        };

        methods += &format!(
            "/// `{id}`\nfn {method}(&self, ctx: ::weft::{ctx}{input}) -> impl ::std::future::Future<Output = ::std::result::Result<{name}Output, {error}>> + Send;\n",
            id = s.id,
            method = s.method,
            ctx = s.ctx,
        );
        let (param, args) = if s.input.is_some() { (format!("input: {name}Input"), "ctx, input") } else { ("_: ()".to_string(), "ctx") };
        table += &format!(
            ".add({id:?}, {{ let s = service.clone(); move |ctx: ::weft::{ctx}, {param}| {{ let s = s.clone(); async move {{ s.{method}({args}).await }} }} }})\n",
            id = s.id,
            ctx = s.ctx,
            method = s.method,
        );
    }

    let text = format!(
        r#"{types}
{extra}
{body}
/// The contract's hash: `GET /_weft/health` reports it, and the supervisor refuses a binary built from another one.
pub const CONTRACT_HASH: &str = {hash:?};

/// Every function `remote('rust://{service}')` implements. Written by `weft::build`: edit the TypeScript, not this.
pub trait Service: Send + Sync + 'static {{
    {methods}
}}

/// What `weft::router` serves.
pub fn functions<S: Service>(service: S) -> ::weft::Functions {{
    let service = ::std::sync::Arc::new(service);
    ::weft::Functions::new({service:?}, CONTRACT_HASH)
    {table}
}}
"#,
        types = space.to_stream(),
    );
    let file = syn::parse_file(&text).map_err(|e| format!("generated code didn't parse: {e}"))?;
    let pretty = prettyplease::unparse(&file);
    Ok(pretty.replace("::chrono::", "::weft::__rt::chrono::").replace("::uuid::", "::weft::__rt::uuid::").replace("::regress::", "::weft::__rt::regress::"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn contract(functions: Value) -> Value {
        json!({ "functions": functions, "services": { "search": { "hash": "h1" } } })
    }

    fn function(name: &str, input: Value, output: Value, ctx: &str, errors: Value) -> Value {
        json!({ "id": format!("{name}.abc123"), "name": name, "input": input, "impl": { "service": "search", "ctx": ctx, "output": output, "errors": errors } })
    }

    #[test]
    fn names_follow_the_function() {
        assert_eq!(snake("searchDocs"), "search_docs");
        assert_eq!(snake("match"), "match_");
        assert_eq!(pascal("searchDocs"), "SearchDocs");
    }

    #[test]
    fn one_method_a_function_with_its_context_and_errors() {
        let code = render(
            &contract(json!([
                function("searchDocs", json!({ "type": "object", "properties": { "q": { "type": "string" } }, "required": ["q"] }), json!({ "type": "array", "items": { "type": "object", "properties": { "id": { "type": "string" } }, "required": ["id"] } }), "shared", json!({})),
                function("saveDoc", Value::Null, json!({ "type": "null" }), "user", json!({ "NotFound": { "type": "object", "properties": { "id": { "type": "string" } }, "required": ["id"] } })),
                function("other", Value::Null, json!({ "type": "string" }), "ctx", json!({})),
            ])),
            "search",
        )
        .unwrap();
        assert!(code.contains("fn search_docs("), "{code}");
        assert!(code.contains("ctx: ::weft::SharedCtx"));
        assert!(code.contains("input: SearchDocsInput"));
        assert!(code.contains("pub type SearchDocsOutput ="));
        assert!(code.contains("ctx: ::weft::UserCtx"));
        assert!(!code.contains("SaveDocInput"), "no input, no parameter");
        assert!(code.contains("pub enum SaveDocError"));
        assert!(code.contains("NotFound(SaveDocNotFound)"));
        assert!(code.contains("\"h1\""));
    }

    #[test]
    fn a_service_with_no_functions_says_how_to_fix_it() {
        let e = render(&contract(json!([])), "search").unwrap_err();
        assert!(e.contains("rust://search"), "{e}");
    }

    #[test]
    fn a_tuple_and_a_named_schema_from_zod() {
        let output = json!({ "$schema": "https://json-schema.org/draft/2020-12/schema", "type": "array", "items": { "$ref": "#/$defs/Hit" }, "$defs": { "Hit": { "type": "object", "properties": { "id": { "type": "string" } }, "required": ["id"] } } });
        let tuple = json!({ "type": "array", "prefixItems": [{ "type": "string" }, { "type": "number" }], "minItems": 2, "maxItems": 2 });
        let code = render(&contract(json!([function("hits", tuple, output, "ctx", json!({}))])), "search").unwrap();
        assert!(code.contains("pub struct Hit"), "{code}");
        assert!(code.contains("pub type HitsOutput = ::std::vec::Vec<Hit>"), "{code}");
        assert!(code.contains("pub type HitsInput = (::std::string::String, f64)"), "{code}");
    }

    #[test]
    fn dates_and_uuids_need_no_dependency_of_the_app() {
        let input = json!({ "type": "object", "properties": { "at": { "type": "string", "format": "date-time" }, "id": { "type": "string", "format": "uuid" } }, "required": ["at", "id"] });
        let code = render(&contract(json!([function("f", input, json!({ "type": "null" }), "ctx", json!({}))])), "search").unwrap();
        assert!(code.contains("::weft::__rt::chrono::"), "{code}");
        assert!(code.contains("::weft::__rt::uuid::"), "{code}");
    }
}
