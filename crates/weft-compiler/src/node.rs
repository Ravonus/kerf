//! Node-API binding: text in, JSON text out. No AST crosses the boundary.

use napi_derive::napi;

#[napi]
pub fn transform(source: String, options_json: String) -> String {
    crate::transform_json(&source, &options_json)
}
