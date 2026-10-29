//! Node-API binding: text in, JSON text out. No AST crosses the boundary.

use napi_derive::napi;

#[napi]
pub fn transform(source: String, options_json: String) -> String {
    let options: crate::Options = serde_json::from_str(&options_json).unwrap_or_default();
    serde_json::to_string(&crate::compile(&source, &options)).expect("serializable output")
}
