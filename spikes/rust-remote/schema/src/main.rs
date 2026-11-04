// Each Zod shape through typify. Prints the Rust typify generates, or its failure, per case and per way of handing the
// schema over: `raw` is Zod's output as is, `normal` first rewrites `$defs` and `prefixItems`.
use schemars::schema::{RootSchema, Schema};
use serde_json::{Map, Value, json};
use typify::{TypeSpace, TypeSpaceSettings};

/// What the contract would have to rewrite: typify reads schemars 0.8 schemas (draft-07 spelling).
fn normal(v: &Value) -> Value {
    match v {
        Value::Object(m) => {
            let mut out = Map::new();
            for (k, x) in m {
                match k.as_str() {
                    "$defs" => {
                        out.insert("definitions".into(), normal(x));
                    }
                    "prefixItems" => {
                        out.insert("items".into(), normal(x));
                    }
                    "$schema" => {}
                    "$ref" => {
                        out.insert(
                            k.clone(),
                            json!(x.as_str().unwrap().replace("#/$defs/", "#/definitions/")),
                        );
                    }
                    _ => {
                        out.insert(k.clone(), normal(x));
                    }
                }
            }
            Value::Object(out)
        }
        Value::Array(a) => Value::Array(a.iter().map(normal).collect()),
        x => x.clone(),
    }
}

fn gen_one(name: &str, schema: &Value) -> Result<String, String> {
    let mut settings = TypeSpaceSettings::default();
    settings.with_struct_builder(false);
    let mut space = TypeSpace::new(&settings);
    let root: RootSchema =
        serde_json::from_value(schema.clone()).map_err(|e| format!("not a schema: {e}"))?;
    let defs = root.definitions.clone();
    space
        .add_ref_types(defs)
        .map_err(|e| format!("refs: {e}"))?;
    let id = space
        .add_type_with_name(&Schema::Object(root.schema), Some(name.to_string()))
        .map_err(|e| format!("typify: {e}"))?;
    let shown = space
        .get_type(&id)
        .map_err(|e| e.to_string())?
        .ident()
        .to_string();
    let file = syn::parse2::<syn::File>(space.to_stream()).map_err(|e| format!("syn: {e}"))?;
    let text = prettyplease::unparse(&file);
    Ok(format!("// type: {shown}\n{text}"))
}

fn main() {
    let text = std::fs::read_to_string("schemas.json").unwrap();
    let cases: Value = serde_json::from_str(&text).unwrap();
    let only = std::env::args().nth(1);
    for (name, row) in cases.as_object().unwrap() {
        if only.as_deref().is_some_and(|o| o != name) {
            continue;
        }
        let Some(schema) = row.get("input") else {
            continue;
        };
        let ty = format!("Case{}{}", &name[..1].to_uppercase(), &name[1..]);
        for (how, s) in [("raw", schema.clone()), ("normal", normal(schema))] {
            match gen_one(&ty, &s) {
                Ok(code) => {
                    let body: Vec<&str> = code
                        .lines()
                        .filter(|l| {
                            !l.trim_start().starts_with("///")
                                && !l.trim_start().starts_with("#[doc")
                                && !l.trim().is_empty()
                        })
                        .collect();
                    println!("== {name} [{how}] ok, {} lines", body.len());
                    if only.is_some() && how == "normal" {
                        println!("{code}");
                    }
                    if only.is_none() && how == "normal" {
                        for l in body.iter().filter(|l| {
                            l.contains("pub struct")
                                || l.contains("pub enum")
                                || l.contains("pub type")
                                || l.starts_with("// type")
                                || (l.contains("pub ") && l.contains(':'))
                                || l.contains("tag =")
                                || l.contains("untagged")
                                || l.contains("serde(default")
                        }) {
                            println!("  {l}");
                        }
                    }
                }
                Err(e) => println!("== {name} [{how}] FAIL {e}"),
            }
        }
    }
}
