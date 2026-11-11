//! Node-API binding: text in, JSON text out. No AST crosses the boundary.

use napi_derive::napi;

#[napi]
#[allow(
    clippy::needless_pass_by_value,
    reason = "Node-API hands over owned strings"
)]
pub fn transform(source: String, options_json: String) -> String {
    crate::transform_json(&source, &options_json)
}
